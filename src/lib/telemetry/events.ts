/**
 * The shape of a telemetry event. Document contents never reach it - no text,
 * no file names, no queries, no PDF passwords.
 *
 * The rule is enforced by the type rather than by a test run: `context` holds
 * numbers and flags only, and `code` holds an enumeration plus a path but never
 * a value. An end-to-end run with a single manuscript proves the absence of one
 * substring for exactly one document and says nothing about the rest.
 */
export const eventNames = [
  "app_error",
  "zone_error",
  "action_no_outcome",
  "action_repeat",
  "blocked_click",
  "theme_changed",
  /**
   * A server answer that did not match the schema; the code names the field.
   */
  "schema_error",
  /** A job that could not be created or that came back failed. */
  "job_failed",
  /**
   * Extraction that produced nothing usable, and extraction that produced
   * something we doubt. They are separate names because they are separate
   * questions: the first says which files we cannot read at all, the second
   * says which ones we read badly - and only the second is invisible to the
   * person unless we ask them to look.
   *
   * Both carry numbers alone: the share of printable characters, the number of
   * pages, the size, the version of the parser. Which PDFs we handle badly is
   * answerable from those without a character of anybody's manuscript.
   */
  "extract_failed",
  "extract_suspicious",
] as const;

export type EventName = (typeof eventNames)[number];

export const eventCodes = [
  "SCHEMA_MISMATCH",
  "PARSE_EMPTY",
  "PARSE_FAILED",
  "RENDER_FAILED",
  "TIMEOUT",
  /** An action that cannot run was pressed; the path names which control. */
  "ACTION_BLOCKED",
  /** There was no answer at all: a broken connection or a timeout. */
  "NETWORK_FAILED",
  /**
   * The same idempotency key arrived with a different body. It is a report of
   * our own defect rather than a situation to recover from, so it is loud: a
   * silent self-correction would hide the one failure that looks like
   * success.
   */
  "KEY_REUSE",
] as const;

export type EventCodeKind = (typeof eventCodes)[number];

/** An enumeration, or an enumeration with a path: `SCHEMA_MISMATCH:job.documents[0]`. */
export type EventCode = EventCodeKind | `${EventCodeKind}:${string}`;

/** Numbers and flags only. No strings here - text leaks through them. */
export type EventContext = Readonly<Record<string, number | boolean>>;

export type ClientEvent = {
  readonly name: EventName;
  readonly code?: EventCode;
  readonly context?: EventContext;
  /** Timestamp, in milliseconds. */
  readonly at: number;
};
