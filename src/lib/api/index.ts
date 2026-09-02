/**
 * The public face of the API layer. Only domain types and functions leave here:
 * `wire/`, `schemas/` and `mappers/` are internal, and the linter plus the
 * architecture test hold that line from both sides.
 */
export {
  cancelJob,
  fetchVenueRequirements,
  getEntitlements,
  getJob,
  getModuleResult,
  retryModule,
  scoutFeedback,
  scoutSearch,
  setCsrfToken,
  submitJob,
} from "./client";
export {
  ApiError,
  NetworkError,
  errorCodes,
  isKnownErrorCode,
  messageKeyFor,
  type ApiFailure,
  type ErrorCode,
} from "./errors";
export { isTerminal, nextPollDelayMs, terminalStates } from "./poll";
export { apiSource, startApiSource } from "./source";
