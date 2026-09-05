/*
 * Reached past the door of the module on purpose. What that door also exports
 * is the projection, which needs the registry of texts, and a worker that
 * imported it would carry a second copy of the documents' machinery across the
 * port with it. What is wanted here is the pass itself.
 */
import {
  resolveAnchors,
  type ResolveRequest,
  type ResolveResult,
} from "@/lib/anchor/resolve";

import { readyReply, type WorkerCall, type WorkerReply } from "./protocol";

/**
 * The places of an answer are worked out away from the page.
 *
 * The work is a walk over the whole document to index it, and then a lookup per
 * place; a body may carry hundreds of thousands of places and a manuscript runs
 * to three million characters. On the thread the editor is drawn on that is
 * seconds during which nothing typed appears, over a document somebody is
 * reading. Here the text keeps taking what is typed, and what arrives back is a
 * finished list of places with the status each of them earned.
 *
 * The text is sent in as a copy for the length of the pass rather than shared.
 * Sharing it would mean keeping the worker's view of the document in step with
 * every keystroke, and a pass is shorter than the gap between two of them: it
 * works on the text as it stood when it started, and a pass that has been
 * overtaken by an edit is repeated rather than patched.
 */
type Scope = {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerCall<string, ResolveRequest>>) => void,
  ) => void;
  readonly postMessage: (message: WorkerReply<ResolveResult>) => void;
};

const scope = self as unknown as Scope;

scope.addEventListener("message", (event) => {
  const { id, payload } = event.data;
  try {
    scope.postMessage({ id, type: "done", payload: resolveAnchors(payload) });
  } catch {
    scope.postMessage({ id, type: "failed", payload: { code: "WORKER_CRASHED" } });
  }
});

// Last, for the same reason as in the other workers: it says the listener above
// is attached, and nothing is sent here before it arrives.
scope.postMessage(readyReply);
