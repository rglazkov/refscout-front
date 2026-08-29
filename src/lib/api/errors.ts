import { type Params } from "@/lib/domain";

/**
 * Every refusal the server can give carries the same envelope, so the client
 * has one branch for a status it was not built to expect (§2.8 of the
 * contract). This is that branch, in the domain's own terms: `wire` shapes do
 * not leave lib/api, and an error is something the screens have to render.
 */
export type ApiFailure = {
  readonly code: string;
  /** Names the log line a support conversation can be matched to. */
  readonly requestId: string;
  readonly status: number;
  readonly params?: Params;
  /** The JSON path of the field that failed validation. */
  readonly field?: string;
  readonly retryAfterSec?: number;
};

export class ApiError extends Error {
  readonly failure: ApiFailure;

  constructor(failure: ApiFailure) {
    super(`${failure.code} (${failure.requestId})`);
    this.name = "ApiError";
    this.failure = failure;
  }
}

/** No answer at all - a broken connection or a timeout. The only retryable case. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super("The request did not reach the server");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/**
 * The codes the interface has a sentence for. A code that is not here is drawn
 * as the general refusal with a visible request identifier, so adding a code on
 * the server stays an additive change and does not break a released client
 * (M1.7.7).
 *
 * The list is checked against the contract by a test: a code the contract names
 * and the dictionary does not have is a person reading "something went wrong".
 */
export const errorCodes = [
  "SCHEMA_INVALID",
  "AUTH_REQUIRED",
  "ACCESS_CLOSED",
  "CSRF_INVALID",
  "JOB_NOT_FOUND",
  "MODULE_NOT_RETRYABLE",
  "RETRY_LIMIT_REACHED",
  "RESULT_NOT_READY",
  "RESULT_SUPERSEDED",
  "DOC_TOO_LARGE",
  "JOB_TOO_LARGE",
  "TOO_MANY_DOCUMENTS",
  "UNSUPPORTED_ENCODING",
  "IDEMPOTENCY_KEY_REUSE",
  "RATE_LIMITED",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
  "VENUE_FETCH_FAILED",
  "VENUE_FETCH_TIMEOUT",
  "VENUE_URL_INVALID",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export function isKnownErrorCode(code: string): code is ErrorCode {
  return (errorCodes as readonly string[]).includes(code);
}

/** The dictionary key the interface looks the phrase up under. */
export function messageKeyFor(code: string): string {
  return isKnownErrorCode(code) ? `errors.codes.${code}` : "errors.unknown";
}
