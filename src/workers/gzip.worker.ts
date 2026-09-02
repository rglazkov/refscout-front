import { compress, type CompressRequest, type CompressResult } from "./gzip";
import { readyReply, type WorkerCall, type WorkerReply } from "./protocol";

/**
 * The body is compressed away from the main thread because it is tens of
 * megabytes: encoding and deflating it in the page would freeze it for seconds
 * at exactly the moment the person has pressed the button and is watching.
 */
type Scope = {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerCall<string, CompressRequest>>) => void,
  ) => void;
  readonly postMessage: (
    message: WorkerReply<CompressResult>,
    transfer: readonly Transferable[],
  ) => void;
};

const scope = self as unknown as Scope;

scope.addEventListener("message", (event) => {
  const { id, payload } = event.data;
  void compress(payload.json).then(
    (result) =>
      // Transferred rather than copied: a second copy of a forty-megabyte body
      // on the way back is the cost this worker exists to avoid.
      scope.postMessage({ id, type: "done", payload: result }, [result.bytes.buffer]),
    () =>
      scope.postMessage({ id, type: "failed", payload: { code: "WORKER_CRASHED" } }, []),
  );
});

// Last, for the same reason as in the parsing worker: it says the listener
// above is attached, and nothing is sent here before it arrives.
scope.postMessage(readyReply, []);
