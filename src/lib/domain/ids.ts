/**
 * The enumerations the whole application speaks in. They are written here by
 * hand rather than inferred from the generated schemas (M1.1.1): `z.infer`
 * yields wire types, and a domain inferred from the wire is a domain shaped by
 * somebody else's JSON.
 *
 * They are declared as const tuples because the screens need to iterate them -
 * four checkboxes on a card, three severity dots on a result - and a union type
 * cannot be iterated.
 */
export { isModuleId, moduleIds, type ModuleId } from "./modules";

/**
 * What a check needs to know about a document. Derived from the ticked checks
 * and never asked of the user (§4, §18).
 */
export const docRoles = [
  "manuscript",
  "bibliography",
  "glossary",
  "venue-requirements",
  "unknown",
] as const;

export type DocRole = (typeof docRoles)[number];

/**
 * What the document was brought as. It is kept apart from what the content
 * turned out to be, because a download has to give the file back in the format
 * it arrived in (§9, §18).
 */
export const sourceFormats = [
  "pdf",
  "docx",
  "md",
  "tex",
  "bib",
  "gls",
  "txt",
  "typed",
] as const;

export type SourceFormat = (typeof sourceFormats)[number];

/** The formats this milestone reads. PDF and Word arrive with their parsers in M2. */
export const textFormats = ["txt", "md", "bib", "tex", "gls"] as const;

export type TextFormat = (typeof textFormats)[number];

export function isTextFormat(format: SourceFormat): format is TextFormat {
  return (textFormats as readonly SourceFormat[]).includes(format);
}

/** What the content turned out to be, read from the text rather than the extension (§4). */
export const detectedKinds = [
  "pdf",
  "latex",
  "bibtex",
  "markdown",
  "text",
  "unknown",
] as const;

export type DetectedKind = (typeof detectedKinds)[number];

export const severities = ["critical", "warning", "info"] as const;

export type Severity = (typeof severities)[number];

/**
 * Only the first two are added up anywhere on screen. `info` is what Cite's
 * claims arrive as, and mixing it into the counters would leave a document
 * whose heading and whose cards name different numbers (§9).
 */
export const countedSeverities = ["critical", "warning"] as const;

export type Counts = Readonly<Record<Severity, number>>;

export const jobStates = [
  "queued",
  "running",
  "partial",
  "finished",
  "failed",
  "cancelled",
] as const;

export type JobState = (typeof jobStates)[number];

export const moduleStates = ["queued", "running", "ok", "error", "skipped"] as const;

export type ModuleRunState = (typeof moduleStates)[number];

export const stageStates = ["pending", "running", "done", "error", "skipped"] as const;

export type StageState = (typeof stageStates)[number];

export const lockReasons = [
  "requires-account",
  "requires-paid",
  "trial-used",
  "period-ended",
] as const;

export type LockReason = (typeof lockReasons)[number];
