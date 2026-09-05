import { type DetectedKind, type DocRole, type ModuleId, type SourceFormat } from "./ids";
import { type DocOffset } from "./offsets";
import { type CheckOptions } from "./options";

/**
 * How far extraction got. Only the first three occur on text formats; the rest
 * arrive with pdf.js and mammoth, and they are declared up front because the
 * card, the plan and the results screen all branch on this field, and a state
 * added later means revisiting each of them.
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

/**
 * Why extraction did not produce a usable document. Every row of the table of
 * parsing errors is one of these, and each is a state of the card with a way
 * out beside it rather than a message that disappears.
 *
 * The list lives here with the other enumerations, and not with the parsers,
 * because both ends need it: the worker produces one of these and the card
 * reads it. Putting it beside pdf.js would mean a screen importing a parser.
 */
export const extractFailureCodes = [
  /** The file could not be read: removed, no permission, changed on disk. */
  "FILE_UNREADABLE",
  "PDF_PASSWORD_REQUIRED",
  "PDF_PASSWORD_WRONG",
  "PDF_CORRUPT",
  /** A PDF whose pages are images: there is no text layer to extract. */
  "NO_TEXT_LAYER",
  "DOCX_UNREADABLE",
  "DOCX_EMPTY",
  "ARCHIVE_TOO_MANY_ENTRIES",
  "ARCHIVE_ENTRY_TOO_LARGE",
  /** The parts added up, which is a different ceiling and a different number. */
  "ARCHIVE_TOTAL_TOO_LARGE",
  "ARCHIVE_RATIO_TOO_HIGH",
  /** Nothing was extracted, from a format that was read without complaint. */
  "TEXT_EMPTY",
  /** The text came out as rubbish: replacement characters, unprintable runs. */
  "TEXT_SUSPICIOUS",
  /** Replacement characters: the bytes did not decode as the text they were. */
  "TEXT_BAD_ENCODING",
  /** Some pages of a PDF would not parse; the rest of the document is usable. */
  "PAGES_MISSING",
  "WORKER_TIMEOUT",
  "WORKER_CRASHED",
  "CANCELLED",
  /**
   * The one code here about the way back out rather than the way in: the Word
   * file could not be assembled from the text. It shares this enumeration
   * because a worker's refusal travels as one code whichever direction it was
   * working in, and a second enumeration for a single value would be two lists
   * to keep in step.
   */
  "DOCX_BUILD_FAILED",
] as const;

export type ExtractFailureCode = (typeof extractFailureCodes)[number];

/** Numbers only, for the same reason telemetry carries numbers only. */
export type ExtractFailureParams = Readonly<Record<string, number>>;

/** Where the requirements for a document's venue came from. */
export type VenueKind = "url" | "text" | "file";

export type VenueFetchState =
  "loading" | "ready" | "failed" | "timeout" | "not-requirements";

export type VenueRef = {
  readonly kind: VenueKind;
  /** What the person entered: an address, a file name, or "pasted". */
  readonly source: string;
  /**
   * The attachment carrying the requirements as text. All three ways end in
   * one: a page fetched from an address is read into the browser exactly as a
   * dropped file is, so the requirements are a text that can be opened,
   * corrected and removed like any other.
   */
  readonly docId?: string;
  readonly state?: VenueFetchState;
  /** The refusal behind `failed`, so the card can say which of the three it was. */
  readonly errorCode?: string;
};

export type ExtractInfo = {
  readonly state: ExtractState;
  /**
   * In Unicode code points, not `String.length`. The limits are measured in
   * this unit and so is the server, and two units would disagree on exactly the
   * formulas, emoji and CJK a manuscript is made of.
   */
  readonly chars: number;
  readonly words: number;
  readonly pages?: number;
  readonly pagesParsed?: number;
  /**
   * Which pages would not parse. They are listed rather than counted, because
   * "47 of 60 pages" tells a person how much is missing and this tells them
   * whether the missing part is the one they care about.
   */
  readonly missingPages?: readonly number[];
  readonly printableRatio?: number;
  /** The text was edited by hand since it was read out of the file. */
  readonly edited: boolean;
  /**
   * SHA-256 of the text as it now stands. It is kept beside the description so
   * that two questions can be answered without reaching into the registry for a
   * three-million-character string: whether this differs from the text that was
   * extracted, and whether it differs from the text a finished job was given -
   * which is what tells the results screen that its coordinates have moved.
   */
  readonly sha256: string;
  readonly errorCode?: ExtractFailureCode;
  /** The numbers the sentence on the card needs: entries, bytes, pages, ratio. */
  readonly errorParams?: ExtractFailureParams;
};

/**
 * One element of the buffer. Its origin is not privileged: a file from the
 * disk, a paste and typed text are the same kind of thing here.
 *
 * There is no text on this type. Text lives in the docRegistry alone, so that
 * it cannot reach serialised state or an error report.
 */
export type BufferItem = {
  readonly id: string;
  readonly origin: "file" | "paste" | "typed";
  /** Sanitised, for display. */
  readonly name: string;
  /**
   * The name as the file system gave it. This is what travels to the server:
   * our sanitisation is a rule about showing a name, not a fact about the file,
   * and a name trimmed to 80 characters cannot be found again in a support
   * conversation.
   */
  readonly rawName: string;
  readonly sourceSize: number;
  readonly sourceFormat: SourceFormat;
  readonly detected: DetectedKind;
  /** What to do with this document - what the person ticks. */
  readonly checks: readonly ModuleId[];
  /** Once a person has touched the ticks, the automatic proposal stops overriding them. */
  readonly checksTouched: boolean;
  /** Derived from `checks`, and sent alongside them. */
  readonly role: DocRole;
  readonly venue?: VenueRef;
  /**
   * The other document a check on this one reads. It is the same idea as the
   * venue's requirements, and it is optional in the same way: without the
   * companion the check runs and does less, and the plan says which part of it
   * will not happen.
   */
  readonly companions: Companions;
  /**
   * Set when this is not a document of the buffer at all but something hanging
   * off one: the bibliography BibCheck reads, the glossary file Glossary reads,
   * the venue's requirements, or a file a finished check wrote. An attachment
   * is brought in from the configuration panel of the document it belongs to,
   * never from the drop zone, and it does not appear in the list or count
   * against the number of documents.
   */
  readonly attachedTo?: Attachment;
  /** The settings of this document's checks, edited on its own card. */
  readonly options: CheckOptions;
  readonly extract: ExtractInfo;
  readonly localFindings: readonly LocalFinding[];
};

/**
 * Which document each check reads besides the one it runs on, by module.
 * BibCheck on a manuscript reads the bibliography that manuscript cites - that
 * is what makes missing citations and uncited entries answerable at all.
 * Glossary reads a glossary file that already exists, so the acronyms defined
 * in it are left alone. The value is the id of the attachment carrying it.
 */
export type Companions = Partial<Record<ModuleId, string>>;

/**
 * Where an attachment hangs. The three slots a person fills are the three
 * places a check needs a second text, and all three are filled the same way -
 * drop a file, choose a file, or paste the text.
 *
 * `artifact` is the fourth and is not filled by hand: it is the file a finished
 * check wrote, kept here so that it opens in the editor like any other text and
 * is downloaded from there.
 */
export const attachmentSlots = ["bibcheck", "glossary", "venue", "artifact"] as const;

export type AttachmentSlot = (typeof attachmentSlots)[number];

/** The three a person fills by hand, which is every slot but the artifact. */
export type FilledSlot = Exclude<AttachmentSlot, "artifact">;

export type Attachment = {
  /** The document this hangs off. */
  readonly docId: string;
  readonly slot: AttachmentSlot;
};

/**
 * What reading a bibliography in the browser can say without a server. It is
 * deliberately short: these are the things visible in the file itself, and
 * everything that needs the outside world - whether a work was retracted,
 * whether a DOI resolves - belongs to the check that has the outside world.
 */
export const localFindingCodes = [
  /** Two entries under one key: whichever is cited, one of them is not. */
  "BIB_DUPLICATE_KEY",
  /**
   * The file did not read as a whole. The text is accepted as any other text
   * and the check still runs on it; what stops is this reading of it, so the
   * card says the lint is off rather than pretending it found nothing.
   */
  "BIB_UNREADABLE",
] as const;

export type LocalFindingCode = (typeof localFindingCodes)[number];

/** A problem found in the browser, before anything is sent. */
export type LocalFinding = {
  readonly code: LocalFindingCode;
  readonly severity: "warning" | "info";
  readonly params?: Readonly<Record<string, string | number>>;
};

/**
 * The content of one document. It lives in the docRegistry, outside React and
 * outside telemetry, and the same shape is what IndexedDB will hold.
 *
 * The original extracted text is kept as a hash rather than as a copy: the
 * question it answers is "has this been edited", and a boolean does not need a
 * second copy of a three-million-character document.
 */
export type DocContent = {
  readonly text: string;
  readonly originalSha256: string;
  readonly pages?: readonly PageSpan[];
  readonly bibEntries?: readonly BibSpan[];
  readonly meta?: DocMeta;
  /**
   * The shape of the file as it arrived, so it can be rebuilt on download. Two
   * things, and there is no third: the encoding is not among them, because
   * every document in the product is a UTF-8 string whatever bytes it came
   * from, and the file handed back is UTF-8 too.
   */
  readonly hadBom: boolean;
  readonly eol: "\n" | "\r\n" | "\r";
};

/**
 * Where one page of the original sits in the extracted text. Its boundaries are
 * in the browser's own units, like every map built while a document was read:
 * what they are compared with is a place that has already been through the
 * conversion, and a map in the unit of the wire would put a finding on the page
 * before the one it is on as soon as a formula appeared above it.
 */
export type PageSpan = {
  readonly page: number;
  readonly from: DocOffset;
  readonly to: DocOffset;
};

export type BibSpan = {
  readonly key: string;
  readonly from: DocOffset;
  readonly to: DocOffset;
};

/** What the parser read out of the file. PreSubmit reads it for anonymity. */
export type DocMeta = Readonly<Record<string, string>>;

/** The paste overlay before "Add to buffer" is pressed. */
export type IntakeDraft = {
  readonly text: string;
  readonly syntax: "auto" | "latex" | "markdown" | "text";
};
