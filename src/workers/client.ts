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
 * How long a worker has to say it is there. It is separate from the ceiling on
 * the work, and so is what happens when it runs out: the next way of starting
 * a worker is tried, and only when there is none left does the card say the
 * document could not be read.
 *
 * Short, because there is nothing slow about starting one. The file is a
 * kilobyte and its parsers arrive later, so a worker that has not spoken in
 * three seconds is not a slow worker - it is a browser that will not run this
 * kind of worker, and it says so by staying silent. Being wrong about that
 * costs a larger download and nothing else.
 */
const START_TIMEOUT_MS = 3_000;

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
   * Whether any worker of this kind has ever said it is listening. Until one
   * has, the pool holds a single instance however large it is allowed to be:
   * a browser that refuses this kind of worker says so with three seconds of
   * silence, and paying that once is finding out, while paying it on every call
   * at the same moment is every document waiting the same three seconds for the
   * same answer.
   */
  let proven = false;
  /** Callers with nowhere to run yet, woken as instances come free. */
  const waiting: (() => void)[] = [];

  const nextSpawn = (): (() => Worker) | undefined => spawns[attempt];

  const wake = (): void => waiting.shift()?.();

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
   * One new worker, together with the promise of its handshake. Failing to
   * start is not this function's business to retry: it hands back an instance
   * whose `ready` rejects, and the caller decides whether there is another way
   * of starting one left to try.
   */
  const spawn = (start: () => Worker, spawnIndex: number): Instance => {
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
          // still leave the fallback to be tried.
          attempt = Math.max(attempt, spawnIndex + 1);
          reject(new ParseFailure("WORKER_CRASHED"));
        };

        const timer = setTimeout(giveUp, START_TIMEOUT_MS);

        const onReady = (event: MessageEvent<WorkerReply>): void => {
          if (event.data.type !== "ready") return;
          finish();
          // This kind of worker starts in this browser, so the pool may grow.
          // Anybody who was made to wait for that answer is woken to ask again.
          proven = true;
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
  const acquire = async (): Promise<Instance> => {
    for (;;) {
      const idle = pool.find((instance) => !instance.busy);
      if (idle !== undefined) {
        idle.busy = true;
        return idle;
      }
      // A second instance only once a first has proved that this kind of worker
      // starts here at all.
      if (pool.length < poolSize && (proven || pool.length === 0)) {
        const index = attempt;
        const start = spawns[index];
        if (start === undefined) throw new ParseFailure("WORKER_CRASHED");
        return spawn(start, index);
      }
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
  };

  /**
   * An instance that has said it is listening. A worker that would not start is
   * not a document that would not parse, so while there is another way of
   * starting one this takes it rather than making the person press the button
   * again.
   */
  const open = async (): Promise<Instance> => {
    for (;;) {
      const instance = await acquire();
      try {
        await instance.ready;
        return instance;
      } catch (cause) {
        discard(instance);
        if (nextSpawn() === undefined) throw cause;
      }
    }
  };

  const call = async <Q, R>(
    callType: string,
    request: Q,
    options: RunOptions,
  ): Promise<R> => {
    if (options.signal?.aborted === true) throw new ParseFailure("CANCELLED");

    const instance = await open();
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
      }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

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
