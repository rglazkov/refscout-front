/**
 * The shape of a telemetry event. Document contents never reach it - no text,
 * no fragments, no file names, no DOI, no search query, no PDF password.
 *
 * The rule is enforced by the type rather than by a test run: `context` holds
 * numbers and flags only, `code` holds an enumeration plus a path but never a
 * value, and the one free-text field is the sentence a person typed into the
 * report form themselves, knowing they were writing it. An end-to-end run with
 * a single manuscript proves the absence of one substring for exactly one
 * document and says nothing about the one that was not in the run.
 */

/**
 * What happened. The list is closed and it is the same list the receiver
 * accepts, because a kind the two sides disagree about is a batch refused in
 * full.
 *
 * Three of them are declared and not yet sent: `slow_operation`,
 * `stalled_action` and `repeated_click` answer "was it comfortable" rather than
 * "did it work", and each needs one wrapper around every action in the product
 * that knows the intention and waits for the outcome. They are named here so
 * that neither the receiver nor the queue has to change to accept them.
 */
export const eventKinds = [
  /* The program fell over. */
  "js_error",
  "promise_rejection",
  "react_error",
  "worker_error",
  /* The data was not what we expected. */
  "api_error",
  "schema_error",
  "network_error",
  /* The parse produced nothing, or produced something we doubt. */
  "extract_failed",
  "extract_suspicious",
  /* The response was worse than expected, or the press did nothing. */
  "slow_operation",
  "stalled_action",
  "blocked_action",
  "repeated_click",
  /**
   * How the findings landed on the text. The share of relocated and lost
   * anchors per module is the number that shows a divergence from the backend
   * the day after a release rather than a month later through support, and it
   * is a large part of why this module exists at all.
   */
  "anchor_degraded",
  "anchor_rejected",
  "anchor_budget",
  /**
   * How much room the browser is giving us. Eviction is the one loss of a
   * person's only copy that we do not control, and it has to be visible as a
   * number rather than as a letter to support.
   */
  "storage_pressure",
  /** The person said what was wrong themselves. */
  "user_report",
] as const;

export type EventKind = (typeof eventKinds)[number];

export const eventCodes = [
  "SCHEMA_MISMATCH",
  /**
   * The body was counted over a text that is not the one we sent, or in a unit
   * the contract does not allow. Its findings are still shown; what they lose
   * is their places, so this is the number that says how often the product is
   * giving out lists instead of locations.
   */
  "TEXT_MISMATCH",
  "OFFSET_UNIT_UNSUPPORTED",
  /**
   * A quote that is not as long as the range it describes: truncated, or
   * measured in another unit. The lengths travel with it, never the quote.
   */
  "QUOTE_LENGTH_MISMATCH",
  /** The same finding identifier twice in one body; both findings are kept. */
  "DUPLICATE_ISSUE_ID",
  /**
   * One code of a module answered under two dictionary keys, or one key under
   * two codes. The pairing is what makes a finding readable in a language other
   * than the module's own, and a drift in it is only visible from here.
   */
  "TITLE_KEY_DRIFT",
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
  /**
   * An exception nobody caught, and a promise nobody handled. Together they are
   * the whole of what a browser tells us about a crash outside React, and
   * without them the only witness to a broken screen is the person at it.
   */
  "UNCAUGHT_ERROR",
  "UNHANDLED_REJECTION",
  /**
   * A worker that died mid-work. It answers no message and rejects no promise,
   * so without this the failure is silent on both sides of the port.
   */
  "WORKER_CRASHED",
  /**
   * The server refused. The path is the code it refused with -
   * `API_REFUSED:RATE_LIMITED` - so the enumeration here stays closed and the
   * server's own dictionary is not copied into this file to drift from itself.
   */
  "API_REFUSED",
  /**
   * How the findings were placed. Counters and shares only: a quote in an
   * anchoring event is exactly the leak that is most tempting to add while
   * anchoring is being debugged.
   */
  "ANCHOR_DEGRADED",
  "ANCHOR_REJECTED",
  "ANCHOR_BUDGET",
  /** Space used and available, and whether the origin was granted persistence. */
  "STORAGE_ESTIMATE",
  /** What a person sent from the report form. */
  "USER_REPORT",
] as const;

export type EventCodeKind = (typeof eventCodes)[number];

/** An enumeration, or an enumeration with a path: `SCHEMA_MISMATCH:job.documents[0]`. */
export type EventCode = EventCodeKind | `${EventCodeKind}:${string}`;

/**
 * Numbers and flags only. Enumerated values travel in `code`, where the type
 * keeps the set closed; a string here would be the door a fragment of somebody's
 * manuscript eventually arrives through, and no amount of care at the call site
 * closes a door the type leaves open.
 */
export type EventContext = Readonly<Record<string, number | boolean>>;

/**
 * What the person was doing, and how it ended. The path leading up to a failure
 * is reconstructed from these, and no field of one holds what they were working
 * on: the action is a name from a closed list, and the outcome is one of five
 * words.
 */
export const breadcrumbActions = [
  "add-document",
  "remove-document",
  "clear-buffer",
  "open-editor",
  "close-editor",
  "toggle-check",
  "run-check",
  "cancel-check",
  "retry-module",
  "download-report",
  "search",
  "compare",
  "switch-mode",
  "sign-out",
  "open-report",
] as const;

export type BreadcrumbAction = (typeof breadcrumbActions)[number];

export const breadcrumbOutcomes = [
  "started",
  "done",
  "failed",
  "blocked",
  "cancelled",
] as const;

export type BreadcrumbOutcome = (typeof breadcrumbOutcomes)[number];

export type Breadcrumb = {
  readonly action: BreadcrumbAction;
  readonly outcome: BreadcrumbOutcome;
  /** ISO 8601, on the same clock as the event carrying it. */
  readonly ts: string;
};

/**
 * The one free-text field in the whole of telemetry. It is written by the
 * person in the report form, and the excerpt beside it is attached only by a
 * deliberate act of theirs - never by us, and never by default.
 */
export type UserReport = {
  readonly message: string;
  readonly excerpt?: string;
};

export type Viewport = { readonly w: number; readonly h: number };

export type ClientEvent = {
  readonly id: string;
  /** ISO 8601. */
  readonly ts: string;
  readonly kind: EventKind;
  readonly code: EventCode;
  /** Identical events are collapsed onto the first of them by this. */
  readonly fingerprint: string;
  readonly count: number;
  /** The build. Without it an event says that something broke and not where. */
  readonly release: string;
  /** A path with no query string: `/`, `/features`. */
  readonly route: string;
  readonly locale: string;
  readonly theme: "light" | "dark";
  readonly viewport: Viewport;
  readonly context: EventContext;
  readonly breadcrumbs: readonly Breadcrumb[];
  /** Ties the event to a line in the server's own log. */
  readonly requestId?: string;
  readonly report?: UserReport;
};
