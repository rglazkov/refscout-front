import {
  type AttachmentSlot,
  type BufferItem,
  type DocContent,
  type ExtractFailureCode,
  type ExtractInfo,
  type ExtractState,
  type FilledSlot,
  type SourceFormat,
  defaultOptions,
} from "@/lib/domain";
import {
  detectKind,
  extensionOf,
  formatOf,
  fromString,
  holdSourceFile,
  releaseSourceFile,
  proposeChecks,
  refuseAttachmentBySize,
  refuseAttachmentByVolume,
  refuseBySize,
  refuseByVolume,
  roleFromChecks,
  sanitizeDocumentName,
  selfKind,
  sha256Hex,
  type IntakeRefusal,
} from "@/lib/docs";
import { track } from "@/lib/telemetry";
import {
  ParseFailure,
  extract,
  isParseFailure,
  measure,
  type Measured,
  type Parsed,
  type RunOptions,
} from "@/workers";

import { assessText } from "./assess";

/**
 * Intake and extraction. This module takes a file and gives back the result of
 * reading it; who puts that anywhere is not its business.
 *
 * That is not tidiness. The same module is meant to be reused whole by both
 * panels of DiffChecker, and knowing about the buffer would make that
 * impossible. The rule is held by a lint rule and by the architecture test,
 * not by memory.
 *
 * Nothing is parsed here. Every format goes through the worker, PDF and Word
 * included, and what comes back is either a parsed document or a refusal with
 * numbers in it - because a file that will not parse is a file that cannot be
 * checked at all, and the person needs a way out on the card rather than an
 * apology.
 */
export type IntakeResult =
  | { readonly ok: true; readonly item: BufferItem; readonly content: DocContent }
  | { readonly ok: false; readonly refusal: IntakeRefusal; readonly name: string };

export type IntakeContext = {
  /** Code points already in the buffer, for the whole-buffer limit. */
  readonly bufferChars: number;
};

export type ExtractOptions = RunOptions & {
  /** Typed on the card of a protected PDF and held nowhere else. */
  readonly password?: string;
};

function newId(): string {
  return crypto.randomUUID();
}

/**
 * The card a document has while it is being read. It exists before the text
 * does, because the parse of a three-hundred-page PDF takes seconds and those
 * seconds have to be visible on the document they belong to, with a button that
 * stops them.
 */
export function placeholderFor(file: File, id = newId()): BufferItem {
  const format = formatOf(file.name);
  return {
    id,
    origin: "file",
    name: sanitizeDocumentName(file.name),
    rawName: file.name,
    sourceSize: file.size,
    sourceFormat: format ?? "txt",
    detected: "unknown",
    checks: [],
    checksTouched: false,
    role: "unknown",
    companions: {},
    options: defaultOptions,
    extract: { state: "reading", chars: 0, words: 0, edited: false, sha256: "" },
    localFindings: [],
  };
}

/**
 * A file from the disk. Refusals of intake come back as data rather than as
 * exceptions: every one of them is a state the card has to show, with the
 * numbers in it.
 *
 * A refusal of extraction is different in kind and is not a refusal at all: the
 * document stays in the buffer carrying the reason, because the way out - a
 * password, another attempt, the text typed in by hand - is offered on its own
 * card and needs a card to be offered on.
 */
export async function acceptFile(
  file: File,
  context: IntakeContext,
  options: ExtractOptions = {},
  id = newId(),
): Promise<IntakeResult> {
  const name = sanitizeDocumentName(file.name);

  const tooBig = refuseBySize(file.size);
  if (tooBig !== null) return { ok: false, refusal: tooBig, name };

  const format = formatOf(file.name);
  if (format === null) {
    // An extension we do not know is refused with the extension named, so the
    // sentence can offer a way out rather than a dead end.
    return {
      ok: false,
      refusal: { code: "UNSUPPORTED_FORMAT", extension: extensionOf(file.name) },
      name,
    };
  }

  // Held for the length of the parse, and past it only where a way out on the
  // card would need to read the file a second time. It is a handle to the
  // person's own disk, not a copy of anything.
  holdSourceFile(id, file);

  const parsed = await read(file, format, options);
  if (!parsed.ok) {
    return {
      ok: true,
      item: failedItem({ id, file, format, failure: parsed.failure }),
      content: emptyContent(),
    };
  }

  const measured = await measurementsOf(parsed.value);
  const tooLong = refuseByVolume(measured.chars, context.bufferChars);
  if (tooLong !== null) return { ok: false, refusal: tooLong, name };

  const built = await build({
    id,
    origin: "file",
    rawName: file.name,
    name,
    sourceSize: file.size,
    format,
    parsed: { ...parsed.value, measured },
  });

  /*
   * The text is out, so the file is done with: from here the product works on
   * the extracted text, and the file handed back at the end is written from
   * that text and not from this one.
   *
   * A document that did not read cleanly keeps its handle, and that is the
   * whole reason the handle outlives the parse at all. "Try again" after a
   * failure, a password typed on the card, a partial or doubtful parse read
   * again - each of them opens the same file a second time, and there is no
   * second copy of it anywhere to open.
   */
  if (built.ok && built.item.extract.state === "ready") releaseSourceFile(id);
  return built;
}

/** Pasted or typed text. It is an element of the buffer like any other. */
export async function acceptText(
  raw: string,
  displayName: string,
  format: SourceFormat,
  context: IntakeContext,
): Promise<IntakeResult> {
  const name = sanitizeDocumentName(displayName);
  const extracted = fromString(raw, format);
  // Measured once and carried into `build`, so the refusal below and the card
  // afterwards are answered by the same walk over the text.
  const measured = await measurementsOf({ extracted });

  const tooLong = refuseByVolume(measured.chars, context.bufferChars);
  if (tooLong !== null) return { ok: false, refusal: tooLong, name };

  return build({
    origin: "typed",
    rawName: displayName,
    name,
    sourceSize: new TextEncoder().encode(extracted.text).length,
    format,
    parsed: { extracted, measured },
  });
}

/**
 * A file brought in for one of the attachment slots. It is read exactly like a
 * document and never leaves the browser; what differs is the ceiling it is
 * measured against and that it carries no ticks of its own - the check that
 * reads it is ticked on the document it hangs off.
 */
export async function acceptAttachmentFile(
  file: File,
  slot: FilledSlot,
  checkChars = 0,
): Promise<IntakeResult> {
  const name = sanitizeDocumentName(file.name);

  const tooBig = refuseAttachmentBySize(slot, file.size);
  if (tooBig !== null) return { ok: false, refusal: tooBig, name };

  const format = formatOf(file.name);
  if (format === null) {
    return {
      ok: false,
      refusal: { code: "UNSUPPORTED_FORMAT", extension: extensionOf(file.name) },
      name,
    };
  }

  const parsed = await read(file, format, {});
  if (!parsed.ok) {
    const id = newId();
    holdSourceFile(id, file);
    return {
      ok: true,
      item: { ...failedItem({ id, file, format, failure: parsed.failure }), checks: [] },
      content: emptyContent(),
    };
  }

  const measured = await measurementsOf(parsed.value);
  const tooLong = refuseAttachmentByVolume(slot, measured.chars, checkChars);
  if (tooLong !== null) return { ok: false, refusal: tooLong, name };

  return build({
    origin: "file",
    rawName: file.name,
    name,
    sourceSize: file.size,
    format,
    parsed: { ...parsed.value, measured },
    slot,
  });
}

/** The same slot, filled by pasting the text instead of bringing the file. */
export async function acceptAttachmentText(
  raw: string,
  displayName: string,
  slot: FilledSlot,
  format: SourceFormat = "typed",
  checkChars = 0,
): Promise<IntakeResult> {
  const name = sanitizeDocumentName(displayName);
  const extracted = fromString(raw, format);
  const measured = await measurementsOf({ extracted });

  const tooLong = refuseAttachmentByVolume(slot, measured.chars, checkChars);
  if (tooLong !== null) return { ok: false, refusal: tooLong, name };

  return build({
    origin: "paste",
    rawName: displayName,
    name,
    sourceSize: new TextEncoder().encode(extracted.text).length,
    format,
    parsed: { extracted, measured },
    slot,
  });
}

/**
 * A file a finished check wrote - a corrected bibliography, a generated
 * glossary. It is not brought in by anyone: it arrives with the results and is
 * turned into a text of the browser so that it opens in the editor and is
 * downloaded from there, like every other text in the product.
 *
 * Its identity is derived rather than random, so opening the same artifact
 * twice reaches the same text and the edits made in it are still there.
 */
export async function acceptArtifact(input: {
  readonly docId: string;
  readonly module: string;
  readonly name: string;
  readonly format: SourceFormat;
  readonly text: string;
}): Promise<{ readonly item: BufferItem; readonly content: DocContent }> {
  const result = await build({
    id: artifactId(input.docId, input.module),
    origin: "file",
    rawName: input.name,
    name: sanitizeDocumentName(input.name),
    sourceSize: new TextEncoder().encode(input.text).length,
    format: input.format,
    parsed: { extracted: fromString(input.text, input.format) },
    slot: "artifact",
  });
  // `build` refuses nothing on this path: an artifact has already been made and
  // there is no ceiling it could be turned away by.
  if (!result.ok) throw new Error("an artifact is never refused");
  return {
    item: {
      ...result.item,
      attachedTo: { docId: input.docId, slot: "artifact" },
    },
    content: result.content,
  };
}

export function artifactId(docId: string, module: string): string {
  return `${docId}:${module}:artifact`;
}

/**
 * The one call into the worker. Bytes are read here rather than inside it,
 * because a file that has been moved or revoked since it was dropped fails at
 * exactly this line, and that is a row of the table with its own way out.
 */
async function read(
  file: File,
  format: SourceFormat,
  options: ExtractOptions,
): Promise<{ ok: true; value: Parsed } | { ok: false; failure: ParseFailure }> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, failure: new ParseFailure("FILE_UNREADABLE") };
  }

  try {
    const value = await extract(
      {
        bytes,
        format,
        ...(options.password === undefined ? {} : { password: options.password }),
      },
      options,
    );
    return { ok: true, value };
  } catch (cause) {
    return {
      ok: false,
      failure: isParseFailure(cause) ? cause : new ParseFailure("WORKER_CRASHED"),
    };
  }
}

/** Which state of the card a refusal from a parser puts the document into. */
export function stateOfFailure(code: ExtractFailureCode): ExtractState {
  if (code === "PDF_PASSWORD_REQUIRED" || code === "PDF_PASSWORD_WRONG") {
    return "needs-password";
  }
  // A document with no text in it is not a broken document: nothing went
  // wrong, there is simply nothing here to check, and the way out is different.
  if (code === "NO_TEXT_LAYER" || code === "DOCX_EMPTY" || code === "TEXT_EMPTY") {
    return "empty";
  }
  return "failed";
}

function failedItem(input: {
  readonly id: string;
  readonly file: File;
  readonly format: SourceFormat;
  readonly failure: ParseFailure;
}): BufferItem {
  const { code, params } = input.failure;
  track("extract_failed", {
    code: `PARSE_FAILED:${code}`,
    context: { bytes: input.file.size, ...(params ?? {}) },
  });
  return {
    ...placeholderFor(input.file, input.id),
    sourceFormat: input.format,
    extract: {
      state: stateOfFailure(code),
      chars: 0,
      words: 0,
      edited: false,
      sha256: "",
      errorCode: code,
      ...(params === undefined ? {} : { errorParams: params }),
    },
  };
}

/** A failed document still has a text: an empty one, which the person may fill in. */
function emptyContent(): DocContent {
  return {
    text: "",
    originalSha256: "",
    hadBom: false,
    eol: "\n",
  };
}

/**
 * The counters and the hash of a text. A parsed document brings them with it -
 * they were taken in the worker, in the same walk that produced the text - and
 * only a text somebody typed or pasted is measured here, where the whole of it
 * is a paragraph rather than a book.
 */
async function measurementsOf(parsed: Parsed): Promise<Measured> {
  if (parsed.measured !== undefined) return parsed.measured;
  const { text } = parsed.extracted;
  return { ...measure(text), sha256: await sha256Hex(text) };
}

async function build(input: {
  readonly id?: string;
  readonly origin: BufferItem["origin"];
  readonly rawName: string;
  readonly name: string;
  readonly sourceSize: number;
  readonly format: SourceFormat;
  readonly parsed: Parsed;
  /** Set when this is an attachment rather than a document of the buffer. */
  readonly slot?: AttachmentSlot;
}): Promise<IntakeResult> {
  const { extracted, pages, meta, pageCount, pagesParsed, missingPages } = input.parsed;
  const { text, hadBom, eol } = extracted;
  // An attachment is read by the check that is ticked on the document it hangs
  // off, so it carries no ticks itself and nothing is proposed on it.
  const checks = input.slot === undefined ? proposeChecks(text, input.format) : [];
  const detected = detectKind(text, input.format);
  const stats = await measurementsOf(input.parsed);
  const originalSha256 = stats.sha256;
  const quality = assessText(extracted, stats, missingPages);

  const extract: ExtractInfo = {
    state: quality.state,
    chars: stats.chars,
    words: stats.words,
    edited: false,
    // The hash of the text as it stands. It answers two questions with one
    // number: whether the document has been edited since it was read, and
    // whether it has been edited since the job carrying it left.
    sha256: originalSha256,
    ...(pageCount === undefined ? {} : { pages: pageCount }),
    ...(pagesParsed === undefined ? {} : { pagesParsed }),
    ...(missingPages === undefined ? {} : { missingPages }),
    ...(quality.printableRatio === undefined
      ? {}
      : { printableRatio: quality.printableRatio }),
    ...(quality.code === undefined ? {} : { errorCode: quality.code }),
    ...(quality.params === undefined ? {} : { errorParams: quality.params }),
  };

  if (quality.state === "suspicious") {
    track("extract_suspicious", {
      code: `PARSE_FAILED:${quality.code ?? "TEXT_SUSPICIOUS"}`,
      context: {
        chars: extract.chars,
        printableRatio: Math.round((quality.printableRatio ?? 0) * 1000) / 1000,
        pages: pageCount ?? 0,
      },
    });
  }

  const item: BufferItem = {
    id: input.id ?? newId(),
    origin: input.origin,
    name: input.name,
    rawName: input.rawName,
    sourceSize: input.sourceSize,
    sourceFormat: input.format,
    detected,
    checks,
    checksTouched: input.slot !== undefined,
    role: roleFromChecks(checks, {
      ...(input.slot === undefined ? {} : { slot: input.slot }),
      self: selfKind(input.format, detected),
    }),
    companions: {},
    options: defaultOptions,
    extract,
    localFindings: [],
  };

  const content: DocContent = {
    text,
    originalSha256,
    hadBom,
    eol,
    ...(pages === undefined ? {} : { pages }),
    ...(meta === undefined ? {} : { meta }),
  };

  return { ok: true, item, content };
}
