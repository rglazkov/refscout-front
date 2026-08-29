import {
  type BufferItem,
  type DocContent,
  type SourceFormat,
  isTextFormat,
} from "@/lib/domain";
import {
  countCodePoints,
  countWords,
  detectKind,
  extensionOf,
  formatOf,
  proposeChecks,
  refuseBySize,
  refuseByVolume,
  roleFromChecks,
  sanitizeDocumentName,
  sha256Hex,
  type IntakeRefusal,
} from "@/lib/docs";

import { fromString, readTextFile } from "./read-text";

/**
 * Intake and extraction (M1.3.2). This module takes a file and gives back the
 * result of reading it; who puts that anywhere is not its business.
 *
 * That is not tidiness. In M11 the same module is reused whole by both panels
 * of DiffChecker, and knowing about the buffer would make that impossible. The
 * rule is held by a lint rule and by the architecture test, not by memory.
 */
export type IntakeResult =
  | { readonly ok: true; readonly item: BufferItem; readonly content: DocContent }
  | { readonly ok: false; readonly refusal: IntakeRefusal; readonly name: string };

export type IntakeContext = {
  /** Code points already in the buffer, for the whole-buffer limit. */
  readonly bufferChars: number;
};

function newId(): string {
  return crypto.randomUUID();
}

/**
 * A file from the disk. Refusals come back as data rather than as exceptions:
 * every one of them is a state the card has to show, with the numbers in it
 * (M1.3.5, §14).
 */
export async function acceptFile(
  file: File,
  context: IntakeContext,
): Promise<IntakeResult> {
  const name = sanitizeDocumentName(file.name);

  const tooBig = refuseBySize(file.size);
  if (tooBig !== null) return { ok: false, refusal: tooBig, name };

  const format = formatOf(file.name);
  if (format === null || !isTextFormat(format)) {
    // PDF and Word are accepted from M2 onwards, when their parsers arrive; an
    // extension we do not know is refused with the extension named, so the
    // sentence can offer a way out rather than a dead end (§5).
    return {
      ok: false,
      refusal: { code: "UNSUPPORTED_FORMAT", extension: extensionOf(file.name) },
      name,
    };
  }

  const extracted = await readTextFile(file);
  const tooLong = refuseByVolume(extracted.text, context.bufferChars);
  if (tooLong !== null) return { ok: false, refusal: tooLong, name };

  return build({
    origin: "file",
    rawName: file.name,
    name,
    sourceSize: file.size,
    format,
    extracted,
  });
}

/** Pasted or typed text. It is an element of the buffer like any other (§4). */
export async function acceptText(
  raw: string,
  displayName: string,
  format: SourceFormat,
  context: IntakeContext,
): Promise<IntakeResult> {
  const name = sanitizeDocumentName(displayName);
  const extracted = fromString(raw);

  const tooLong = refuseByVolume(extracted.text, context.bufferChars);
  if (tooLong !== null) return { ok: false, refusal: tooLong, name };

  return build({
    origin: "typed",
    rawName: displayName,
    name,
    sourceSize: new TextEncoder().encode(extracted.text).length,
    format,
    extracted,
  });
}

async function build(input: {
  readonly origin: BufferItem["origin"];
  readonly rawName: string;
  readonly name: string;
  readonly sourceSize: number;
  readonly format: SourceFormat;
  readonly extracted: Awaited<ReturnType<typeof readTextFile>>;
}): Promise<IntakeResult> {
  const { text, hadBom, eol, encoding } = input.extracted;
  const checks = proposeChecks(text, input.format);
  const chars = countCodePoints(text);

  const item: BufferItem = {
    id: newId(),
    origin: input.origin,
    name: input.name,
    rawName: input.rawName,
    sourceSize: input.sourceSize,
    sourceFormat: input.format,
    detected: detectKind(text, input.format),
    checks,
    checksTouched: false,
    role: roleFromChecks(checks),
    extract: {
      // A text file that read as empty is not a failure of extraction, but it
      // has nothing to check either, so it is the state that says so.
      state: chars === 0 ? "empty" : "ready",
      chars,
      words: countWords(text),
      edited: false,
    },
    localFindings: [],
  };

  const content: DocContent = {
    text,
    originalSha256: await sha256Hex(text),
    hadBom,
    eol,
    encoding,
  };

  return { ok: true, item, content };
}
