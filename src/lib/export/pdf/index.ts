import { PDFDocument } from "pdf-lib";

import { type ReportDoc } from "../report";
import { Faces, type FaceBytes } from "./faces";
import { type PdfWording } from "./files";
import { addOutline } from "./outline";
import { drawReport } from "./render";
import { Sheet } from "./sheet";

/**
 * The findings report as a file somebody can keep.
 *
 * Everything here happens in the browser, like every other file this product
 * hands back: the text of a manuscript never leaves it, so the report quoting
 * that text cannot be assembled anywhere else either. The faces arrive as bytes
 * from `public/fonts/pdf` and are embedded in the file, which is what makes a
 * report over a Cyrillic or Greek manuscript come out set rather than blank.
 */
export type ReportPdfInput = {
  readonly doc: ReportDoc;
  readonly fonts: FaceBytes;
  readonly wording: PdfWording;
  /**
   * What the file says produced it, in its own properties. It is passed in
   * because the product's name is not written anywhere inside `src`.
   */
  readonly producer: string;
};

export async function renderReportPdf(input: ReportPdfInput): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  /*
   * The properties carry the title of the report and nothing about the
   * manuscripts. A file name or a fragment of somebody's text in the metadata
   * of a document they are about to send to a supervisor is a leak of exactly
   * the kind this product is built not to have.
   */
  document.setTitle(input.doc.title);
  document.setProducer(input.producer);
  document.setCreator(input.producer);

  const faces = await Faces.embed(document, input.fonts);
  const sheet = new Sheet(document, faces);
  /*
   * The index the reader shows down its own side is built from what the drawing
   * found out: which page each document opened on and where each check began.
   * Nothing else knows that - it is settled by how the text fell.
   */
  addOutline(document, drawReport(sheet, input.doc, input.wording));
  return document.save();
}

export { type FaceBytes } from "./faces";
export { type PdfWording, type Role } from "./files";
