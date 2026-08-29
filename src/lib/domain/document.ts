import { type DetectedKind, type DocRole, type ModuleId, type SourceFormat } from "./ids";

/**
 * How far extraction got. Only the first three occur on text formats; the rest
 * arrive with pdf.js and mammoth in M2, and they are declared now because the
 * card, the plan and the results screen all branch on this field, and a state
 * added later means revisiting each of them (§18).
 */
export const extractStates = [
  "reading",
  "extracting",
  "ready",
  "needs-password",
  "partial",
  "empty",
  "suspicious",
  "failed",
] as const;

export type ExtractState = (typeof extractStates)[number];

/** Where the requirements for a document's venue came from (§4, §18). */
export type VenueKind = "preset" | "url" | "text" | "file";

export type VenueFetchState =
  "loading" | "ready" | "failed" | "timeout" | "not-requirements";

export type VenueRef = {
  readonly kind: VenueKind;
  /** What the person entered: a preset id, an address, pasted text or a file name. */
  readonly source: string;
  /**
   * The requirements as text - the only part of this that reaches the server.
   * Empty for a preset, which the server expands from the id it is given.
   */
  readonly text?: string;
  /** The document in this buffer carrying the requirements, for `kind: "file"`. */
  readonly docId?: string;
  readonly state?: VenueFetchState;
  /** The refusal behind `failed`, so the card can say which of the three it was. */
  readonly errorCode?: string;
};

export type ExtractInfo = {
  readonly state: ExtractState;
  /**
   * In Unicode code points, not `String.length`. The limits are measured in
   * this unit and so is the server, and two units would disagree on exactly
   * the formulas, emoji and CJK a manuscript is made of (§6, §18).
   */
  readonly chars: number;
  readonly words: number;
  readonly pages?: number;
  readonly pagesParsed?: number;
  readonly printableRatio?: number;
  /** The text was edited by hand before the run. */
  readonly edited: boolean;
  readonly errorCode?: string;
};

/**
 * One element of the buffer. Its origin is not privileged: a file from the
 * disk, a paste and typed text are the same kind of thing here (§4).
 *
 * There is no text on this type. Text lives in the docRegistry alone, so that
 * it cannot reach serialised state or an error report (§17).
 */
export type BufferItem = {
  readonly id: string;
  readonly origin: "file" | "paste" | "typed";
  /** Sanitised, for display (§19). */
  readonly name: string;
  /**
   * The name as the file system gave it. This is what travels to the server:
   * our sanitisation is a rule about showing a name, not a fact about the file,
   * and a name trimmed to 80 characters cannot be found again in a support
   * conversation (§18).
   */
  readonly rawName: string;
  readonly sourceSize: number;
  readonly sourceFormat: SourceFormat;
  readonly detected: DetectedKind;
  /** What to do with this document - what the person ticks (§4). */
  readonly checks: readonly ModuleId[];
  /** Once a person has touched the ticks, the automatic proposal stops overriding them. */
  readonly checksTouched: boolean;
  /** Derived from `checks`, and sent alongside them (§4, §18). */
  readonly role: DocRole;
  readonly venue?: VenueRef;
  readonly extract: ExtractInfo;
  readonly localFindings: readonly LocalFinding[];
};

/** A problem found in the browser, before anything is sent. */
export type LocalFinding = {
  readonly code: string;
  readonly severity: "warning" | "info";
  readonly params?: Readonly<Record<string, string | number>>;
};

/**
 * The content of one document. It lives in the docRegistry, outside React and
 * outside telemetry; from M4 the same shape is what IndexedDB holds (§17).
 *
 * The original extracted text is kept as a hash rather than as a copy: the
 * question it answers is "has this been edited", and a boolean does not need a
 * second copy of a three-million-character document (§6).
 */
export type DocContent = {
  readonly text: string;
  readonly originalSha256: string;
  readonly pages?: readonly PageSpan[];
  readonly bibEntries?: readonly BibSpan[];
  readonly meta?: DocMeta;
  /** The shape of the file as it arrived, so it can be rebuilt on download (§9). */
  readonly hadBom: boolean;
  readonly eol: "\n" | "\r\n" | "\r";
  readonly encoding: string;
};

export type PageSpan = {
  readonly page: number;
  readonly from: number;
  readonly to: number;
};

export type BibSpan = {
  readonly key: string;
  readonly from: number;
  readonly to: number;
};

/** What the parser read out of the file. PreSubmit reads it for anonymity (§18). */
export type DocMeta = Readonly<Record<string, string>>;

/** The paste overlay before "Add to buffer" is pressed (§5, §18). */
export type IntakeDraft = {
  readonly text: string;
  readonly syntax: "auto" | "latex" | "bibtex" | "markdown" | "text";
};
