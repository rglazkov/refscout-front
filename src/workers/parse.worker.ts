import {
  isParseFailure,
  parseDocument,
  type ParseRequest,
  type Parsed,
} from "@/lib/parse";

import { readyReply, type WorkerCall, type WorkerReply } from "./protocol";

/**
 * The worker every document is parsed in. It holds no logic of its own: it
 * unwraps the envelope, calls the parser and wraps what comes back, so that the
 * parsing can be run and tested without a worker at all while still never
 * running outside one in the product.
 *
 * There is no DOM here and no network - an architectural test says so. That is
 * a requirement of the threat model rather than an optimisation: a whole class
 * of risk in parsing strangers' binary formats has left the server and arrived
 * in this tab, and this is the box it is kept in.
 */
type Scope = {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerCall<string, ParseRequest>>) => void,
  ) => void;
  readonly postMessage: (message: WorkerReply<Parsed>) => void;
};

const scope = self as unknown as Scope;

scope.addEventListener("message", (event) => {
  const { id, payload } = event.data;

  void parseDocument(payload, {
    onProgress: (progress) =>
      scope.postMessage({ id, type: "progress", payload: progress }),
  }).then(
    (parsed) => scope.postMessage({ id, type: "done", payload: parsed }),
    (cause: unknown) => {
      scope.postMessage({
        id,
        type: "failed",
        // Anything that is not one of our own refusals is a defect rather than
        // a document problem, and it is reported as one instead of being
        // dressed up as a parsing error.
        payload: isParseFailure(cause) ? cause.toData() : { code: "WORKER_CRASHED" },
      });
    },
  );
});

// Said last, and it has to be last: it is the promise that a message sent now
// will be heard, and it would be a lie before the listener above exists.
scope.postMessage(readyReply);
