import bold from "../../public/fonts/pdf/inter-600.ttf";
import sans from "../../public/fonts/pdf/inter-400.ttf";
import mono from "../../public/fonts/pdf/jetbrains-mono-400.ttf";
import serif from "../../public/fonts/pdf/literata-400.ttf";

import { renderReportPdf, type FaceBytes, type PdfWording } from "@/lib/export/pdf";
import { type ReportDoc } from "@/lib/export/report";

import { readyReply, type WorkerCall, type WorkerReply } from "./protocol";

/**
 * The findings report is written into a PDF away from the page.
 *
 * Two reasons, and either would be enough. The writer and the faces it embeds
 * are two megabytes between them, and nobody who has not asked for a report
 * should download them; here they arrive with the first press and never on a
 * page. And the work is long where it matters most - a job over a thesis can
 * hold thousands of findings, every one of them measured, wrapped and drawn -
 * so on the main thread it would be a tab frozen for seconds at the moment the
 * person pressed the button and is watching.
 *
 * The faces are built in as bytes rather than fetched. This worker is handed
 * whole manuscripts, and the rule for anything that sees one is that it cannot
 * reach the network at all; a font is a file we ship, so there is no reason for
 * it to arrive any other way.
 */
export type ReportRequest = {
  readonly doc: ReportDoc;
  readonly wording: PdfWording;
  readonly producer: string;
};

type Scope = {
  readonly addEventListener: (
    type: "message",
    listener: (event: MessageEvent<WorkerCall<string, ReportRequest>>) => void,
  ) => void;
  readonly postMessage: (
    message: WorkerReply<Uint8Array>,
    transfer: readonly Transferable[],
  ) => void;
};

const scope = self as unknown as Scope;

const fonts: FaceBytes = { sans, bold, serif, mono };

scope.addEventListener("message", (event) => {
  const { id, payload } = event.data;
  void renderReportPdf({
    doc: payload.doc,
    fonts,
    wording: payload.wording,
    producer: payload.producer,
  }).then(
    // Transferred rather than copied: the file is the whole point of the call
    // and there is no reason for two of it to exist.
    (bytes) => scope.postMessage({ id, type: "done", payload: bytes }, [bytes.buffer]),
    () =>
      scope.postMessage({ id, type: "failed", payload: { code: "WORKER_CRASHED" } }, []),
  );
});

// Last, for the same reason as in the other workers: it says the listener above
// is attached, and nothing is sent here before it arrives.
scope.postMessage(readyReply, []);
