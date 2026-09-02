import { compare, type DiffResult } from "@/lib/diff";

import { readyReply, type WorkerCall, type WorkerReply } from "./protocol";

/**
 * Two versions are compared away from the page.
 *
 * The comparison is one pass over both texts in full, and the texts here are
 * the size of a thesis, so on the main thread it is seconds of a frozen tab
 * with the caret in it. Here the panes keep scrolling and keep taking what is
 * typed while it runs, and the answer arrives as a finished list of ranges.
 */
export type DiffRequest = { readonly a: string; readonly b: string };

type Scope = {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerCall<string, DiffRequest>>) => void,
  ) => void;
  readonly postMessage: (message: WorkerReply<DiffResult>) => void;
};

const scope = self as unknown as Scope;

scope.addEventListener("message", (event) => {
  const { id, payload } = event.data;
  try {
    scope.postMessage({ id, type: "done", payload: compare(payload.a, payload.b) });
  } catch {
    scope.postMessage({ id, type: "failed", payload: { code: "WORKER_CRASHED" } });
  }
});

// Last, for the same reason as in the other workers: it says the listener above
// is attached, and nothing is sent here before it arrives.
scope.postMessage(readyReply);
