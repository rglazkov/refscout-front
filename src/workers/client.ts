import { ParseFailure, type ParseFailureData } from "@/lib/parse/failure";
import { type ParseProgress } from "@/lib/parse/types";
import { track } from "@/lib/telemetry";

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
  /** Ends the worker. The next call starts a new one. */
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
 * One worker, kept between calls and replaced whenever it is torn down. Calls
 * are serialised: cancelling means terminating - a parser in the middle of a
 * synchronous conversion cannot be asked politely to stop - and terminating a
 * worker that was also serving somebody else's document would cancel that too.
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
): WorkerClient<Request, Result> {
  let worker: Worker | null = null;
  let started: Promise<Worker> | null = null;
  let attempt = 0;
  let queue: Promise<unknown> = Promise.resolve();

  const stop = (): void => {
    worker?.terminate();
    worker = null;
    started = null;
  };

  /** The next way of starting it, or nothing left to try. */
  const nextSpawn = (): (() => Worker) | undefined => spawns[attempt];

  /**
   * The worker, once it has said it is listening. Nothing is posted before
   * that: a message sent into the window between a worker's script starting
   * and its listener being attached is dropped without a trace.
   */
  const start = (): Promise<Worker> => {
    if (started !== null) return started;
    const spawn = nextSpawn();
    if (spawn === undefined) return Promise.reject(new ParseFailure("WORKER_CRASHED"));
    const active = spawn();
    worker = active;
    started = new Promise<Worker>((resolve, reject) => {
      const giveUp = (): void => {
        track("extract_failed", { code: "PARSE_FAILED:WORKER_CRASHED" });
        finish();
        stop();
        // The next call takes the next way of starting it. Silence is what a
        // browser that will not run this kind of worker answers with, so
        // "it never said it was ready" is the only signal there is.
        attempt += 1;
        reject(new ParseFailure("WORKER_CRASHED"));
      };

      const timer = setTimeout(giveUp, START_TIMEOUT_MS);

      const onReady = (event: MessageEvent<WorkerReply>): void => {
        if (event.data.type !== "ready") return;
        finish();
        resolve(active);
      };

      const onError = (): void => giveUp();

      function finish(): void {
        clearTimeout(timer);
        active.removeEventListener("message", onReady);
        active.removeEventListener("error", onError);
      }

      active.addEventListener("message", onReady);
      active.addEventListener("error", onError);
    });
    return started;
  };

  const call = async (request: Request, options: RunOptions): Promise<Result> => {
    if (options.signal?.aborted === true) throw new ParseFailure("CANCELLED");

    let active: Worker;
    try {
      active = await start();
    } catch (cause) {
      // A worker that would not start is not a document that would not parse.
      // If there is another way of starting one, this call takes it rather
      // than making the person press the button again.
      stop();
      if (nextSpawn() === undefined) throw cause;
      active = await start();
    }

    return new Promise<Result>((resolve, reject) => {
      const id = crypto.randomUUID();
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
        if (terminate) stop();
        reject(failure);
      };

      const onMessage = (event: MessageEvent<WorkerReply<Result>>): void => {
        const reply = event.data;
        if (reply.id !== id || settled) return;
        if (reply.type === "progress") {
          options.onProgress?.(reply.payload);
          return;
        }
        if (reply.type === "ready") return;
        finish();
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
        track("extract_failed", { code: "PARSE_FAILED:WORKER_CRASHED" });
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

      const message: WorkerCall = { id, type, payload: request };
      active.postMessage(message);
    });
  };

  return {
    run: (request, options = {}) => {
      // Chained rather than run at once: see the note on the worker above.
      const next = queue.then(
        () => call(request, options),
        () => call(request, options),
      );
      queue = next.catch(() => undefined);
      return next;
    },
    dispose: stop,
  };
}
