import {
  isParseFailure,
  parseDocument,
  readStructure,
  writeDocx,
  type ParseRequest,
  type Parsed,
  type Reading,
} from "@/lib/parse";

import {
  assembleCall,
  type parseCall,
  readCall,
  readyReply,
  type AssembleRequest,
  type ReadRequest,
  type WorkerReply,
} from "./protocol";

/**
 * The worker every document passes through, in both directions. It holds no
 * logic of its own: it unwraps the envelope, calls the right function and wraps
 * what comes back, so that the work can be run and tested without a worker at
 * all while still never running outside one in the product.
 *
 * Three calls rather than three workers. Reading a Word file and writing one
 * back need the same kind of library and much of the same weight, and a
 * bibliography is read again the moment it is edited - splitting those across
 * workers would mean shipping the same code twice and starting a second script
 * to do half of one job.
 *
 * There is no DOM here and no network - an architectural test says so. That is
 * a requirement of the threat model rather than an optimisation: a whole class
 * of risk in parsing strangers' binary formats has left the server and arrived
 * in this tab, and this is the box it is kept in.
 */
type Work =
  | { readonly type: typeof parseCall; readonly payload: ParseRequest }
  | { readonly type: typeof readCall; readonly payload: ReadRequest }
  | { readonly type: typeof assembleCall; readonly payload: AssembleRequest };

type Answer = Parsed | Reading | Uint8Array<ArrayBuffer>;

type Scope = {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<{ readonly id: string } & Work>) => void,
  ) => void;
  readonly postMessage: (message: WorkerReply<Answer>) => void;
};

const scope = self as unknown as Scope;

scope.addEventListener("message", (event) => {
  const { id } = event.data;

  const done = (payload: Answer): void => {
    scope.postMessage({ id, type: "done", payload });
  };

  const failed = (cause: unknown): void => {
    scope.postMessage({
      id,
      type: "failed",
      // Anything that is not one of our own refusals is a defect rather than
      // a document problem, and it is reported as one instead of being
      // dressed up as a parsing error.
      payload: isParseFailure(cause) ? cause.toData() : { code: "WORKER_CRASHED" },
    });
  };

  if (event.data.type === readCall) {
    const { text, format } = event.data.payload;
    void readStructure(text, format).then(done, failed);
    return;
  }

  if (event.data.type === assembleCall) {
    void writeDocx(event.data.payload.text).then(done, failed);
    return;
  }

  void parseDocument(event.data.payload, {
    onProgress: (progress) =>
      scope.postMessage({ id, type: "progress", payload: progress }),
  }).then(done, failed);
});

// Said last, and it has to be last: it is the promise that a message sent now
// will be heard, and it would be a lie before the listener above exists.
scope.postMessage(readyReply);
