import { sha256Hex } from "@/lib/docs/units";
import { isTextFormat } from "@/lib/domain";

import { ParseFailure } from "./failure";
import { measure } from "./quality";
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
    options.onProgress?.({ done: 1, total: 1 });
    return parsed;
  }

  // Unreachable through intake, which refuses an unknown extension before it
  // gets here. It is a failure rather than a throw so that the card still has
  // something to say if it ever is reached.
  throw new ParseFailure("FILE_UNREADABLE");
}
