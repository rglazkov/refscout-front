import { ParseFailure, type ParseFailureData } from "@/lib/parse/failure";
import { type ParseProgress } from "@/lib/parse/types";
import { track } from "@/lib/telemetry";
import { newId } from "@/lib/webcrypto";

import { type WorkerCall, type WorkerReply } from "./protocol";

/**
 * The typed client that hides `postMessage`. A caller sees a promise and a
 * stream of progress; it never sees an event, an id or a listener to remove.
 *
 * Five things are required of every worker in the product, and they are
 * implemented here once rather than in each worker: progress, cancellation, a
 * timeout, a crash that is reported instead of hanging, and an event in
 * telemetry when one of the last three happens. A worker was a convenience
 * while the server did the parsing; now it is the main path the documents
 * travel, and a parse that silently never finishes is a person watching a
 * spinner over the only copy of their manuscript.
 */
export type RunOptions = {
  readonly onProgress?: (progress: ParseProgress) => void;
  readonly signal?: AbortSignal;
  /**
   * The ceiling for one call. It is generous because the work is genuinely
   * long - three hundred pages of PDF take seconds - and its job is to end a
   * parse that has stopped rather than to hurry one that is going.
   */
  readonly timeoutMs?: number;
};

export type WorkerClient<Request, Result> = {
  readonly run: (request: Request, options?: RunOptions) => Promise<Result>;
  /**
   * The same pool, asked to do the other thing this kind of worker knows how to
   * do. A Word file is read and written by one worker - the libraries for both
   * directions live together and neither should arrive twice - so the direction
   * travels in the envelope rather than in a second pool of the same script.
   */
  readonly ask: <Q, R>(type: string, request: Q, options?: RunOptions) => Promise<R>;
  /** Ends every worker of this kind. The next call starts a new one. */
  readonly dispose: () => void;
};

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * How long a worker has to say it is there before the next way of starting one
 * is tried.
 *
 * Short, because there is nothing slow about starting one. The file is a
 * kilobyte and its parsers arrive later, so a worker that has not spoken in
 * three seconds is probably a browser that will not run this kind of worker,
 * and staying silent is how such a browser says so. Being wrong about that
 * costs a larger download and nothing else - which is exactly why this number
 * may only ever decide to try something else.
 *
 * On the last way in the list there is nothing else to try, so this number does
 * not apply there at all and the call's own ceiling does. The difference is the
 * difference between a true answer and a false one: a machine busy enough that
 * a worker takes four seconds to say hello - a build running, a scan, three
 * documents read at once - is not a browser without workers, and treating it as
 * one tells somebody their manuscript could not be read when nothing about it
 * was ever read at all. Waiting is the honest answer, the card says "reading"
 * while it waits, and "Stop" is there for whoever would rather not.
 */
const START_TIMEOUT_MS = 3_000;

/** Whether a failure is the person's own decision rather than a defect. */
function isCancellation(cause: unknown): boolean {
  return cause instanceof ParseFailure && cause.code === "CANCELLED";
}

/**
 * The handshake, or the person deciding not to wait for it.
 *
 * Waiting for a worker to say hello used to be the one stretch of a call that
 * "Stop" could not reach, and while that stretch was three seconds nobody could
 * tell. It is the call's whole ceiling now on a machine too busy to start one,
 * and a button that does nothing for two minutes is worse than no button.
 */
async function handshake(instance: Instance, signal?: AbortSignal): Promise<Worker> {
  if (signal === undefined) return await instance.ready;
  if (signal.aborted) throw new ParseFailure("CANCELLED");

  let stopWatching = (): void => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    const onAbort = (): void => reject(new ParseFailure("CANCELLED"));
    signal.addEventListener("abort", onAbort, { once: true });
    stopWatching = () => signal.removeEventListener("abort", onAbort);
  });

  try {
    return await Promise.race([instance.ready, cancelled]);
  } finally {
    // The losing half of a race is never settled, and a listener left on a
    // signal that outlives the call is a leak per document read.
    stopWatching();
  }
}

/**
 * One worker of this kind, and whether a call is using it.
 *
 * `ready` is the handshake: nothing is posted to a worker before it has said it
 * is listening, and the promise is what every caller of this instance waits on
 * rather than each of them repeating the wait.
 */
type Instance = {
  readonly worker: Worker;
  readonly ready: Promise<Worker>;
  /**
   * Which way of starting a worker made this one. A failure advances the shared
   * counter past its own way and no further: without that, two instances
   * started at the same moment and failing for the same reason count as two
   * failures, and the second of them steps over the fallback and off the end of
   * the list - which is exactly a browser that refuses module workers, where
   * every way after the first is the one that would have worked.
   */
  readonly spawnIndex: number;
  busy: boolean;
};

/**
 * A pool of workers of one kind, and the calls that are using them.
 *
 * Why a pool rather than the single worker this used to be: cancelling means
 * terminating, because a parser in the middle of a synchronous conversion
 * cannot be asked politely to stop - and terminating a worker that was also
 * serving somebody else's document would cancel that too. With one worker the
 * only way to keep that honest was to serialise every call, so a document
 * cancelled on its card had to wait for the queue in front of it. Here a call
 * holds its own instance: cancelling it terminates that instance and nothing
 * else, and two parses that genuinely overlap - a bibliography attached while
 * the manuscript is still being read - run beside each other instead of behind
 * each other.
 *
 * The size is per kind, and it is 1 unless a kind says otherwise. Compression
 * and comparison are called once at a time by the screens that use them, and a
 * pool for them would be idle workers holding memory.
 */
export function createWorkerClient<Request, Result>(
  /**
   * The ways of starting this worker, best first. The second is tried when the
   * first will not start - a module worker is the ordinary case, and a browser
   * that refuses one refuses it silently, so the fallback is what keeps the
   * product from failing without a word for whoever is on it.
   */
  spawns: readonly (() => Worker)[],
  type: string,
  poolSize = 1,
): WorkerClient<Request, Result> {
  const pool: Instance[] = [];
  /*
   * Which way of starting a worker is in use, and it is shared by the whole
   * pool rather than counted per instance: a browser that will not run a module
   * worker will not run the second one either, and finding that out once is
   * enough for every instance after it.
   */
  let attempt = 0;
  /**
   * Which way of starting a worker has answered here, or `null` while none has.
   * It answers two questions at once.
   *
   * Until one has, the pool holds a single instance however large it is allowed
   * to be: a browser that refuses this kind of worker says so with three
   * seconds of silence, and paying that once is finding out, while paying it on
   * every call at the same moment is every document waiting the same three
   * seconds for the same answer.
   *
   * Once one has, it is the way every later instance is started, and a failure
   * no longer walks the list. A browser that ran a module worker at ten o'clock
   * still runs one at four: a start that fails after that is a machine that was
   * busy or a tab that was put to sleep, and treating it as proof that this
   * kind of worker is unsupported would step over the way that works and onto
   * one that does not.
   */
  let proven: number | null = null;
  /** Callers with nowhere to run yet, woken as instances come free. */
  const waiting: (() => void)[] = [];

  const nextSpawn = (): (() => Worker) | undefined => spawns[attempt];

  /**
   * Every way of starting a worker has now failed, and this is the failure the
   * call gets - but the counter goes back to the start on the way out.
   *
   * The reset is the whole point of the function. Without it the counter stands
   * off the end of the list for the life of the page, every later call throws
   * here before a worker is even attempted, and the only cure a person has is
   * to reload the tab over their own manuscript. Two ways of starting a worker
   * failing at one moment is a moment - a machine that was suspended, a tab the
   * browser froze and reclaimed - and the next document dropped in deserves the
   * same attempt the first one got.
   */
  const exhausted = (): ParseFailure => {
    attempt = 0;
    return new ParseFailure("WORKER_CRASHED");
  };

  const wake = (): void => waiting.shift()?.();

  /**
   * A place in the pool, or the person deciding not to wait for one.
   *
   * Queueing is cancellable for the same reason the handshake is. Until a way
   * of starting a worker has answered, the pool holds one instance however
   * large it is allowed to be - so three files dropped together put two of them
   * in this queue behind the first one's start, and on a machine busy enough
   * for that start to take a while, "Stop" on the second card has to mean
   * something.
   */
  const waitForAPlace = async (signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted === true) throw new ParseFailure("CANCELLED");
    let stopWatching = (): void => undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const woken = (): void => resolve();
        waiting.push(woken);
        if (signal === undefined) return;
        const onAbort = (): void => {
          // Out of the queue as well as out of the wait: left in it, this
          // caller would be handed the next free place and nothing would be
          // there to take it, and whoever was behind them would keep waiting.
          const at = waiting.indexOf(woken);
          if (at >= 0) waiting.splice(at, 1);
          reject(new ParseFailure("CANCELLED"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        stopWatching = () => signal.removeEventListener("abort", onAbort);
      });
    } finally {
      stopWatching();
    }
  };

  const discard = (instance: Instance): void => {
    const at = pool.indexOf(instance);
    if (at >= 0) pool.splice(at, 1);
    instance.worker.terminate();
    // A place in the pool has just come free, and somebody may be waiting for
    // one. Without this a cancelled call would leave the queue behind it
    // waiting for an instance that no longer exists.
    wake();
  };

  const release = (instance: Instance): void => {
    instance.busy = false;
    wake();
  };

  /**
   * Every worker of this kind that nothing is using, ended. What is working
   * keeps working: a parse begun before the tab was left has to finish, and the
   * card is waiting on it.
   *
   * It runs when the tab stops being looked at, and it is a correctness fix
   * before it is a saving. A browser reclaims what a hidden tab is not using,
   * and a worker it ended is not a worker that says so: the object is still
   * here, the pool still holds it as idle, its handshake still resolved an hour
   * ago, and posting the next document to it puts the message nowhere. What the
   * person sees is a file that lands in the buffer and is never read, for as
   * long as the tab stays open. Ending them ourselves at the moment the browser
   * starts wanting to means the document dropped in on the way back is handed
   * to a worker started for it.
   *
   * The saving is real too, and it is why this is not merely defensive: three
   * idle parse workers with pdf.js in them are what makes a backgrounded tab
   * worth discarding, and starting one again is milliseconds.
   */
  const releaseIdle = (): void => {
    let freed = false;
    for (let at = pool.length - 1; at >= 0; at -= 1) {
      const instance = pool[at];
      if (instance === undefined || instance.busy) continue;
      pool.splice(at, 1);
      instance.worker.terminate();
      freed = true;
    }
    // The pool has room it did not have, and whoever was waiting for a place
    // may now start one of their own.
    if (freed) wake();
  };

  /*
   * Attached once per kind of worker, for the life of the page. There is no
   * removal because there is no end to the thing it belongs to: these clients
   * are made once when the module loads and last as long as the tab does.
   */
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") releaseIdle();
    });
    window.addEventListener("pagehide", releaseIdle);
  }

  /**
   * One new worker, together with the promise of its handshake. Failing to
   * start is not this function's business to retry: it hands back an instance
   * whose `ready` rejects, and the caller decides whether there is another way
   * of starting one left to try.
   */
  const spawn = (
    start: () => Worker,
    spawnIndex: number,
    /**
     * How long this one has to say hello. It is the short number while another
     * way of starting a worker is left to try, and the call's own ceiling on
     * the last one, where silence means a busy machine rather than a browser
     * without workers.
     */
    startTimeoutMs: number,
  ): Instance => {
    const worker = start();
    const instance: Instance = {
      worker,
      busy: true,
      spawnIndex,
      ready: new Promise<Worker>((resolve, reject) => {
        const giveUp = (): void => {
          // The worker's own failure, reported apart from the extraction that
          // depended on it: a worker that never started and a document we could
          // not read are two different defects, and only one of them is about
          // the file somebody brought.
          track("worker_error", { code: "WORKER_CRASHED:start" });
          finish();
          // The next attempt takes the next way of starting it. Silence is what
          // a browser that will not run this kind of worker answers with, so
          // "it never said it was ready" is the only signal there is. Past this
          // instance's own way and no further, so that two failing at once
          // still leave the fallback to be tried - and only while no way has
          // been proved here, because after that silence is about the moment
          // rather than about the browser.
          if (proven === null) attempt = Math.max(attempt, spawnIndex + 1);
          reject(new ParseFailure("WORKER_CRASHED"));
        };

        const timer = setTimeout(giveUp, startTimeoutMs);

        const onReady = (event: MessageEvent<WorkerReply>): void => {
          if (event.data.type !== "ready") return;
          finish();
          // This kind of worker starts in this browser, so the pool may grow.
          // Anybody who was made to wait for that answer is woken to ask again.
          proven = spawnIndex;
          wake();
          resolve(worker);
        };

        const onError = (): void => giveUp();

        function finish(): void {
          clearTimeout(timer);
          worker.removeEventListener("message", onReady);
          worker.removeEventListener("error", onError);
        }

        worker.addEventListener("message", onReady);
        worker.addEventListener("error", onError);
      }),
    };
    // Nothing here awaits `ready`, and an unhandled rejection is reported by
    // the browser as an error of its own. The caller awaits it; this only says
    // that the promise is not unattended in the meantime.
    instance.ready.catch(() => undefined);
    pool.push(instance);
    return instance;
  };

  /** An instance to run on, marked busy. Waits when the pool is full. */
  const acquire = async (
    /** What a worker started here is given to say hello, by its place in the list. */
    startTimeout: (spawnIndex: number) => number,
    signal?: AbortSignal,
  ): Promise<Instance> => {
    for (;;) {
      const idle = pool.find((instance) => !instance.busy);
      if (idle !== undefined) {
        idle.busy = true;
        return idle;
      }
      // A second instance only once a first has proved that this kind of worker
      // starts here at all.
      if (pool.length < poolSize && (proven !== null || pool.length === 0)) {
        const index = proven ?? attempt;
        const start = spawns[index];
        if (start === undefined) throw exhausted();
        return spawn(start, index, startTimeout(index));
      }
      await waitForAPlace(signal);
    }
  };

  /**
   * An instance that has said it is listening. A worker that would not start is
   * not a document that would not parse, so while there is another way of
   * starting one this takes it rather than making the person press the button
   * again.
   *
   * How long each way is given is decided here, because this is the only place
   * that knows whether there is another one behind it: the short number while
   * there is somewhere to move on to, and what is left of the call's ceiling on
   * the last, where the question silence answers is "is this machine busy" and
   * the only truthful answer to it is to wait.
   */
  const open = async (options: RunOptions, left: () => number): Promise<Instance> => {
    for (;;) {
      const instance = await acquire(
        (spawnIndex) =>
          spawns[spawnIndex + 1] === undefined ? left() : START_TIMEOUT_MS,
        options.signal,
      );
      try {
        await handshake(instance, options.signal);
        return instance;
      } catch (cause) {
        // Whatever it was doing, it is not ours any more: a worker abandoned
        // half-started would sit in the pool marked busy for the life of the
        // page, and every later document would queue behind a handshake that
        // is never coming.
        discard(instance);
        // Waiting is what was given up on, not the way of starting a worker.
        // Walking to the next one here would spend somebody's cancellation on
        // starting another worker they did not ask for.
        if (isCancellation(cause)) throw cause;
        if (nextSpawn() === undefined) {
          exhausted();
          throw cause;
        }
      }
    }
  };

  const call = async <Q, R>(
    callType: string,
    request: Q,
    options: RunOptions,
  ): Promise<R> => {
    if (options.signal?.aborted === true) throw new ParseFailure("CANCELLED");

    /*
     * One ceiling for the whole call, and starting a worker spends out of it
     * like everything else. Two ceilings - one for the start and one for the
     * work - are two numbers a reader has to add up to know how long a document
     * can hold the card, and they add up to twice what either of them says.
     */
    const ceiling = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    const left = (): number => Math.max(0, ceiling - (Date.now() - startedAt));

    const instance = await open(options, left);
    const active = instance.worker;

    return new Promise<R>((resolve, reject) => {
      const id = newId();
      let settled = false;

      const finish = (): void => {
        settled = true;
        clearTimeout(timer);
        active.removeEventListener("message", onMessage);
        active.removeEventListener("error", onError);
        options.signal?.removeEventListener("abort", onAbort);
      };

      const fail = (failure: ParseFailure, terminate: boolean): void => {
        if (settled) return;
        finish();
        // Terminating is the only way to stop work already inside a synchronous
        // pass, and it costs this instance alone: what it was doing is the call
        // being given up on.
        if (terminate) discard(instance);
        else release(instance);
        reject(failure);
      };

      const onMessage = (event: MessageEvent<WorkerReply<R>>): void => {
        const reply = event.data;
        if (reply.id !== id || settled) return;
        if (reply.type === "progress") {
          options.onProgress?.(reply.payload);
          return;
        }
        if (reply.type === "ready") return;
        finish();
        // The worker is intact either way - a document that would not parse is
        // an answer, not a crash - so it goes back to the pool for the next
        // call rather than being started again from nothing.
        release(instance);
        if (reply.type === "done") {
          resolve(reply.payload);
          return;
        }
        const data: ParseFailureData = reply.payload;
        reject(new ParseFailure(data.code, data.params));
      };

      /*
       * A worker that throws while it is working - a chunk that would not load,
       * a parser that ran out of memory - never answers, so the only sign is
       * this event. Without it the card would sit at "extracting" for ever.
       */
      const onError = (): void => {
        track("worker_error", { code: "WORKER_CRASHED" });
        fail(new ParseFailure("WORKER_CRASHED"), true);
      };

      const onAbort = (): void => fail(new ParseFailure("CANCELLED"), true);

      const timer = setTimeout(() => {
        track("extract_failed", { code: "TIMEOUT" });
        fail(new ParseFailure("WORKER_TIMEOUT"), true);
      }, left());

      active.addEventListener("message", onMessage);
      active.addEventListener("error", onError);
      options.signal?.addEventListener("abort", onAbort, { once: true });

      if (options.signal?.aborted === true) {
        onAbort();
        return;
      }

      const message: WorkerCall = { id, type: callType, payload: request };
      active.postMessage(message);
    });
  };

  return {
    run: (request, options = {}) => call<Request, Result>(type, request, options),
    ask: (callType, request, options = {}) => call(callType, request, options),
    dispose: () => {
      for (const instance of pool.splice(0)) instance.worker.terminate();
      // Anything waiting for a place is waiting for a pool that no longer has
      // members; letting them through starts fresh workers, which is what the
      // next call after a dispose is supposed to get.
      while (waiting.length > 0) wake();
    },
  };
}
