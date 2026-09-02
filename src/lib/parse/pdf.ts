import {
  GlobalWorkerOptions,
  PasswordResponses,
  VerbosityLevel,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

import { canonicalise } from "@/lib/docs/canonical";
import { countCodePoints } from "@/lib/docs/units";
import { type DocMeta, type PageSpan } from "@/lib/domain";

import { ParseFailure } from "./failure";
import { assess } from "./quality";
import { aborted, type Parsed, type PdfOptions, type PdfResources } from "./types";

/**
 * PDF, the critical path. Nothing about this file is optional: if pdf.js does
 * not get the text out, the product does not work for that person, because the
 * file is no longer sent anywhere that could try again.
 *
 * pdf.js normally runs its parsing in a worker of its own. We are already in
 * one, so instead of nesting a second worker inside it we hand pdf.js its own
 * message handler and it runs here. Registering the handler on `globalThis` is
 * the supported way of doing that, and it also makes the parser usable from a
 * test process, which is what the corpus run needs.
 *
 * It is the legacy build, and deliberately. The modern one leans on parts of
 * the language that are only just everywhere - the byte-array hex helpers among
 * them - and a browser without one of them does not degrade: extraction throws
 * inside a parser, and the person is told their document is damaged. The
 * transpiled build costs a few kilobytes in a chunk that only arrives with a
 * PDF, and it is the same code the corpus is run against.
 */
(globalThis as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
GlobalWorkerOptions.workerSrc = "";

/**
 * The configuration every document of the product passes through, and it is
 * mandatory rather than recommended. Scripting is off, no external resource is
 * fetched on the document's behalf, and the font compiler is denied eval - a
 * strict CSP would refuse it anyway, and a silent refusal deep inside a parser
 * is a document that extracts as empty.
 */
const HARDENED = {
  isEvalSupported: false,
  enableScripting: false,
  enableXfa: false,
  disableAutoFetch: true,
  /** Fonts installed on the person's machine are not consulted for extraction. */
  useSystemFonts: false,
  /** No font is put in front of the browser: nothing here is rendered. */
  disableFontFace: true,
  isOffscreenCanvasSupported: false,
  isImageDecoderSupported: false,
  /*
   * Said explicitly, and it has to be. Left to its default, pdf.js works out
   * whether its own worker should fetch the character maps by resolving their
   * address against `document.baseURI` - and there is no document here, so the
   * parse throws before it starts. Stating it keeps the fetching on the side of
   * the library that has no such dependency, which is the side we are on.
   */
  useWorkerFetch: true,
} as const;

/**
 * The six fields PreSubmit reads for anonymity. They are sent as fields of
 * their own beside the text: an author's name lives in the properties of a
 * document far more often than in its first page, and a check given the bare
 * text would lose that half of its work and still say "all clear".
 */
const META_FIELDS = [
  "Author",
  "Title",
  "Subject",
  "Creator",
  "Producer",
  "Keywords",
] as const;

/** Pages are joined by a blank line, and the map is measured over the result. */
const PAGE_SEPARATOR = "\n\n";

export async function parsePdf(
  bytes: Uint8Array,
  options: PdfOptions = {},
): Promise<Parsed> {
  const task = getDocument({
    // pdf.js takes ownership of the buffer it is given and leaves it detached,
    // so a retry with a password would find an empty array. A copy costs one
    // pass over bytes we are about to parse anyway.
    data: new Uint8Array(bytes),
    verbosity: VerbosityLevel.ERRORS,
    ...HARDENED,
    ...(options.password === undefined ? {} : { password: options.password }),
    ...resourceParams(options.resources),
  });

  let pdf: PDFDocumentProxy;
  try {
    pdf = await task.promise;
  } catch (cause) {
    throw asFailure(cause);
  }

  try {
    return await readPages(pdf, options);
  } finally {
    // The loading task owns the parser, so ending it is what frees the pages,
    // the fonts and the copy of the file they were read from.
    await task.destroy();
  }
}

async function readPages(pdf: PDFDocumentProxy, options: PdfOptions): Promise<Parsed> {
  const pageCount = pdf.numPages;
  const pages: PageSpan[] = [];
  const missingPages: number[] = [];
  const parts: string[] = [];
  let offset = 0;

  for (let number = 1; number <= pageCount; number += 1) {
    if (aborted(options)) throw new ParseFailure("CANCELLED");

    let pageText: string;
    try {
      const page = await pdf.getPage(number);
      try {
        pageText = canonicalise(await textOf(page), { format: "pdf" }).text;
      } finally {
        page.cleanup();
      }
    } catch {
      // One page that will not parse is not a document that will not parse: the
      // card says which pages are missing, and the person works with the rest
      // or fills them in by hand.
      missingPages.push(number);
      pageText = "";
    }

    if (number > 1) offset += countCodePoints(PAGE_SEPARATOR);
    /*
     * Every page gets a span, empty ones included: a finding on page 40 has to
     * find page 40 in the map whether or not page 39 held any text.
     *
     * Measured in code points, because that is the unit every offset in an
     * answer is counted in. `String.length` counts UTF-16 units, and one
     * emoji or one character above the basic plane earlier in the document
     * would then shift every page boundary past it - so a finding would be
     * reported on the page before the one it is on.
     */
    const pageChars = countCodePoints(pageText);
    pages.push({ page: number, from: offset, to: offset + pageChars });
    offset += pageChars;
    parts.push(pageText);

    options.onProgress?.({ done: number, total: pageCount });
  }

  const text = parts.join(PAGE_SEPARATOR);
  if (assess(text).empty) {
    // A PDF whose pages are pictures. It is not an error of ours and not a
    // damaged file: it is a document with nothing in it to check, and the way
    // out is to bring the text in another way. OCR is not done here.
    throw new ParseFailure("NO_TEXT_LAYER", { pages: pageCount });
  }

  const meta = await metadataOf(pdf);

  return {
    // The pages were canonicalised one at a time and joined with newlines, so
    // the join is already canonical: composition cannot reach across a line
    // break, and the map above therefore describes the finished text.
    extracted: { text, hadBom: false, eol: "\n", repaired: 0 },
    pages,
    pageCount,
    pagesParsed: pageCount - missingPages.length,
    ...(missingPages.length === 0 ? {} : { missingPages }),
    ...(meta === undefined ? {} : { meta }),
  };
}

/**
 * One page as a string. `hasEOL` is what pdf.js knows about the line an item
 * ended: without it the page arrives as one run-on line, and every check that
 * reads a heading or a reference list loses its footing.
 */
async function textOf(page: {
  getTextContent: (options: {
    disableNormalization: boolean;
  }) => Promise<{ items: readonly unknown[] }>;
}): Promise<string> {
  /*
   * Normalisation off, and this is the single most consequential flag in the
   * file. Left on, pdf.js pulls ligatures apart and tidies whitespace on its
   * way out - so the "fi" the person reads is two characters where the document
   * has one, every offset after it has moved, and the check looking for a
   * narrow space before a unit finds an ordinary one. The only normalisation
   * this text gets is the NFC our own canonicalisation applies.
   */
  const content = await page.getTextContent({ disableNormalization: true });
  let out = "";
  for (const item of content.items) {
    const entry = item as { str?: string; hasEOL?: boolean };
    if (typeof entry.str !== "string") continue;
    out += entry.str;
    if (entry.hasEOL === true) out += "\n";
  }
  return out;
}

async function metadataOf(pdf: PDFDocumentProxy): Promise<DocMeta | undefined> {
  let info: Record<string, unknown>;
  try {
    info = (await pdf.getMetadata()).info as unknown as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const meta: Record<string, string> = {};
  for (const field of META_FIELDS) {
    const value = info[field];
    if (typeof value === "string" && value.trim() !== "") meta[field] = value;
  }
  return Object.keys(meta).length === 0 ? undefined : meta;
}

function resourceParams(resources: PdfResources | undefined) {
  if (resources === undefined) return {};
  return {
    // Without these a document written in Chinese, Japanese or Korean extracts
    // as an empty string - which reads as "this is a scan" and turns a
    // perfectly good file away. They are copied beside the build and handed
    // over as paths.
    cMapUrl: resources.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: resources.standardFontDataUrl,
    wasmUrl: resources.wasmUrl,
    iccUrl: resources.iccUrl,
  };
}

function asFailure(cause: unknown): ParseFailure {
  const error = cause as { name?: string; code?: number };
  if (error.name === "PasswordException") {
    return error.code === PasswordResponses.INCORRECT_PASSWORD
      ? new ParseFailure("PDF_PASSWORD_WRONG")
      : new ParseFailure("PDF_PASSWORD_REQUIRED");
  }
  return new ParseFailure("PDF_CORRUPT");
}
