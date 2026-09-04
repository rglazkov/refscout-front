import { sha256Hex } from "@/lib/docs/units";
import { isTextFormat, type SourceFormat } from "@/lib/domain";

import { ParseFailure } from "./failure";
import { measure } from "./quality";
import { type Reading, emptyReading } from "./reading";
import { type ParseRequest, type Parsed, type PdfOptions } from "./types";

export {
  ParseFailure,
  isParseFailure,
  type ParseFailureCode,
  type ParseFailureData,
  type ParseFailureParams,
} from "./failure";
export {
  assess,
  isBlank,
  measure,
  type Measured,
  type Quality,
  type TextStats,
} from "./quality";
export { openContainer, type ArchiveReport } from "./zip";
export { parseText } from "./text";
export { type Reading, emptyReading } from "./reading";
export {
  type ParseOptions,
  type ParseProgress,
  type ParseRequest,
  type Parsed,
  type PdfOptions,
  type PdfResources,
} from "./types";

/**
 * Everything about the text that is a number, taken once, here - where the work
 * already is. What asks for these is the card that appears when the parse ends,
 * and computing them on the thread that draws that card meant walking a
 * three-million-character document six times before it could be drawn.
 */
async function withMeasurements(parsed: Parsed): Promise<Parsed> {
  const { text } = parsed.extracted;
  const [stats, sha256] = [measure(text), await sha256Hex(text)];
  return { ...parsed, measured: { ...stats, sha256 } };
}

/**
 * One entry point for every format. The heavy parsers are reached through
 * `import()` so that a person who brings a `.bib` never downloads pdf.js, and
 * one who brings a PDF never downloads mammoth: the chunk arrives with the
 * document that needs it and not before.
 */
export async function parseDocument(
  request: ParseRequest,
  options: PdfOptions = {},
): Promise<Parsed> {
  if (request.format === "pdf") {
    const { parsePdf } = await import("./pdf");
    return withMeasurements(
      await parsePdf(request.bytes, {
        ...options,
        ...(request.password === undefined ? {} : { password: request.password }),
        ...(request.resources === undefined ? {} : { resources: request.resources }),
      }),
    );
  }

  if (request.format === "docx") {
    const { parseDocx } = await import("./docx");
    return withMeasurements(await parseDocx(request.bytes, options));
  }

  if (isTextFormat(request.format) || request.format === "typed") {
    const { parseText } = await import("./text");
    const parsed = await withMeasurements(parseText(request.bytes, request.format));
    // The structure of a bibliography or a LaTeX source, read straight after
    // the text and from the same worker call: the card that appears when this
    // returns is the card the local warnings belong on, and a second round trip
    // would show it once without them and once with.
    const reading = await readStructure(parsed.extracted.text, request.format);
    options.onProgress?.({ done: 1, total: 1 });
    return { ...parsed, reading };
  }

  // Unreachable through intake, which refuses an unknown extension before it
  // gets here. It is a failure rather than a throw so that the card still has
  // something to say if it ever is reached.
  throw new ParseFailure("FILE_UNREADABLE");
}

/**
 * What the file says about itself besides its text: where the entries of a
 * bibliography are, and what is wrong with it that can be seen here.
 *
 * It is reached on its own as well as through a parse, because an edit changes
 * the answer. A duplicate key the person has just deleted must stop being
 * reported the moment they delete it, and the text they are editing has no file
 * behind it any more - so the same reading is run again over the text as it now
 * stands.
 */
export async function readStructure(
  text: string,
  format: SourceFormat,
): Promise<Reading> {
  if (format === "bib") {
    const { readBibtex } = await import("./bib");
    return readBibtex(text);
  }
  if (format === "tex" || format === "gls") {
    const { readLatex } = await import("./latex");
    return readLatex(text);
  }
  return emptyReading();
}

/**
 * A Word file, written back out of the markdown it became. The one format the
 * browser assembles, because it is the one that is a container rather than
 * text; the libraries for it are reached from here so that they arrive with the
 * download and not with the page.
 */
export async function writeDocx(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const { assembleDocx } = await import("./assemble");
  return assembleDocx(text);
}
