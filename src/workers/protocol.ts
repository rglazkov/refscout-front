import { type ParseFailureData } from "@/lib/parse/failure";
import { type ParseProgress } from "@/lib/parse/types";

/**
 * The one envelope every worker in the product speaks in. It is written before
 * the first parser rather than after: workers that grow their own message
 * shapes have to be debugged, cancelled and timed out one at a time, and by
 * then there are four of them.
 *
 * Nothing here is specific to parsing. `payload` is whatever the worker on the
 * other side was built to take, and the client above turns the replies into a
 * promise and a stream of progress, so no caller ever writes `postMessage`.
 */
export type WorkerCall<T extends string = string, P = unknown> = {
  readonly id: string;
  readonly type: T;
  readonly payload: P;
};

export type WorkerReply<R = unknown> =
  /**
   * Sent once, by the worker, when its module has finished evaluating and its
   * listener is attached. Nothing is sent to a worker before it arrives.
   *
   * This is not ceremony. A worker's inbox holds messages only until its script
   * *starts*; a bundler that registers the entry module a microtask later
   * leaves a window in which a message is delivered to a worker that has no
   * listener yet, and it is dropped in silence. The parse then never finishes
   * and never fails - the person watches a progress bar until a timeout they
   * did nothing to deserve. Chromium happened to win that race and Firefox lost
   * it, which is the worst way for a defect like this to behave.
   */
  | { readonly id: string; readonly type: "ready" }
  | { readonly id: string; readonly type: "progress"; readonly payload: ParseProgress }
  | { readonly id: string; readonly type: "done"; readonly payload: R }
  | { readonly id: string; readonly type: "failed"; readonly payload: ParseFailureData };

/** What a worker sends the moment it can be spoken to. */
export const readyReply: WorkerReply<never> = { id: "", type: "ready" };

/** The names of the calls a parsing worker answers. */
export const parseCall = "parse" as const;

export const compressCall = "compress" as const;
