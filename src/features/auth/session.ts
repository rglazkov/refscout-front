import { ApiError, setCsrfToken } from "@/lib/api";
import { breadcrumb, clearCollected } from "@/lib/telemetry";
import {
  useBufferStore,
  useEntitlementsStore,
  useIntakeDraftStore,
  useJobStore,
} from "@/stores";

/**
 * Whether a refusal is the session's rather than the request's. Two shapes say
 * it: the principal is not signed in, and the CSRF token no longer matches the
 * cookie - which is what an expired session looks like from the middle of a
 * poll. Both are answered by offering the way back in rather than by an empty
 * screen with a code on it.
 */
export function isSessionFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.failure.status === 401 || error.failure.code === "CSRF_INVALID";
}

/**
 * Everything the browser was holding, dropped.
 *
 * Signing out is a privacy gesture and not a working action: the reason it
 * exists is a shared or borrowed computer, where the next person must not find
 * the text of somebody's unpublished manuscript in the tab. So the texts, the
 * buffer, the job and its findings, the draft of a paste and the mirror of the
 * server's answer about access all go - and the server's cache with them,
 * because a cached answer is a second copy of the same analysis.
 *
 * The clearing is done here, on the way out, and not on the way in: a person
 * who signs in has brought their documents with them and would find them gone.
 */
export function clearEverything(clearQueries: () => void): void {
  // Clearing the buffer clears the text registry with it: the extracted text is
  // the only copy of the document in existence, and it lives there.
  useBufferStore.getState().clear();
  useJobStore.getState().reset();
  useIntakeDraftStore.getState().clear();
  useEntitlementsStore.getState().clear();
  /*
   * The unsent events go too. They hold numbers, flags and codes and never a
   * character of a document, so there is nothing in them to protect - but
   * signing out is a gesture of privacy rather than a step of the work, and the
   * answer to "what is left of me in this browser" has to be "nothing". Working
   * actions do not reach here: "New check" and "Clear all" remove documents and
   * findings and leave the events of the run that has just ended alone, which is
   * the moment they are most worth having.
   */
  clearCollected();
  breadcrumb("sign-out", "done");
  clearQueries();
  setCsrfToken(null);
}
