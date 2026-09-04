import { type ExtractedText } from "@/lib/docs/canonical";
import { type DocMeta, type PageSpan, type SourceFormat } from "@/lib/domain";

import { type Measured } from "./quality";
import { type Reading } from "./reading";

/**
 * What a parser hands back. It is the same shape for every format, because the
 * card, the buffer and the request are written once and not per extension: a
 * `.txt` simply arrives with no pages and no metadata.
 */
export type Parsed = {
  readonly extracted: ExtractedText;
  /**
   * Where each page of a PDF sits in the text, in the coordinates of that same
   * text. They are UTF-16 offsets rather than code points, because this map
   * lives beside the browser's copy of the document and is carried across an
   * edit by the editor's own `ChangeSet.mapPos`, which counts in the units the
   * editor counts in. Code points are the unit of the wire, and the map never
   * travels: the page number of a finding is worked out here, from an offset
   * that has already been converted.
   */
  readonly pages?: readonly PageSpan[];
  readonly meta?: DocMeta;
  /** Pages the document declares, and pages we actually read. */
  readonly pageCount?: number;
  readonly pagesParsed?: number;
  /** Which pages were skipped, so the card can list them rather than count them. */
  readonly missingPages?: readonly number[];
  /**
   * Every number about the text, taken where the text was produced. The
   * characters, the words, the share of printable characters, the replacements
   * and the hash all come out of one walk over the document here, in the thread
   * that has nothing else to do, rather than out of six walks on the thread
   * that is drawing the screen.
   *
   * It is optional because a text a person typed never passes through a parser
   * at all; that path measures what it has, which is a paragraph rather than a
   * dissertation.
   */
  readonly measured?: Measured;
  /**
   * What was understood about the file beyond its text: where the entries of a
   * bibliography sit, and the warnings a bibliography earns without anything
   * being sent anywhere. Absent on the formats that have no such structure - a
   * PDF, a Word file, a paragraph somebody typed.
   */
  readonly reading?: Reading;
};

/**
 * Progress of one extraction, as a fraction that is safe to show. Parsers that
 * cannot say how much is left report `total: 0` and the bar stays indeterminate
 * rather than inventing a number.
 */
export type ParseProgress = { readonly done: number; readonly total: number };

export type ParseOptions = {
  readonly onProgress?: (progress: ParseProgress) => void;
  readonly signal?: AbortSignal;
};

/**
 * Read through a function rather than in place: a parser checks the same signal
 * at several points, and an expression the compiler has already seen once is an
 * expression it narrows to `false` for the rest of the function.
 */
export function aborted(options: ParseOptions): boolean {
  return options.signal?.aborted ?? false;
}

/** Where pdf.js finds the resources copied beside the build. */
export type PdfResources = {
  readonly cMapUrl: string;
  readonly standardFontDataUrl: string;
  readonly wasmUrl: string;
  readonly iccUrl: string;
};

export type PdfOptions = ParseOptions & {
  /**
   * Typed on the card and held in the memory of the tab until the parse ends.
   * It is not stored, not logged and not sent: there is nowhere to send it,
   * because the parse happens here.
   */
  readonly password?: string;
  readonly resources?: PdfResources;
};

/**
 * One document, on its way into a worker. It is the whole of what crosses that
 * boundary: bytes, what they are, and the two things a person can add on the
 * card when the first attempt did not work.
 */
export type ParseRequest = {
  readonly bytes: Uint8Array;
  readonly format: SourceFormat;
  /** Typed on the card when a PDF turns out to be protected. */
  readonly password?: string;
  readonly resources?: PdfResources;
};
