import { isTextFormat } from "@/lib/domain";

import { ParseFailure } from "./failure";
import { type ParseRequest, type Parsed, type PdfOptions } from "./types";

export {
  ParseFailure,
  isParseFailure,
  type ParseFailureCode,
  type ParseFailureData,
  type ParseFailureParams,
} from "./failure";
export { assess, countReplacements, printableRatio, type Quality } from "./quality";
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
    return parsePdf(request.bytes, {
      ...options,
      ...(request.password === undefined ? {} : { password: request.password }),
      ...(request.resources === undefined ? {} : { resources: request.resources }),
    });
  }

  if (request.format === "docx") {
    const { parseDocx } = await import("./docx");
    return parseDocx(request.bytes, options);
  }

  if (isTextFormat(request.format) || request.format === "typed") {
    const { parseText } = await import("./text");
    const parsed = parseText(request.bytes, request.format);
    options.onProgress?.({ done: 1, total: 1 });
    return parsed;
  }

  // Unreachable through intake, which refuses an unknown extension before it
  // gets here. It is a failure rather than a throw so that the card still has
  // something to say if it ever is reached.
  throw new ParseFailure("FILE_UNREADABLE");
}
