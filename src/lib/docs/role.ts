import { type DocRole, type ModuleId } from "@/lib/domain";

/**
 * The role a document plays, derived from the checks that are ticked on it
 * (M1.4.4). The user is never asked: the card shows what will be done, and the
 * abstraction the server needs is computed from it (§4, §18).
 *
 * The order of the tests is the whole content of the function. PreSubmit and
 * Cite are checks of a manuscript, so either of them makes the document a
 * manuscript even when BibCheck is ticked as well - which is the ordinary case
 * for a `.tex` with its bibliography inside. Only when neither is ticked does
 * the document become the thing the remaining check reads.
 */
export function roleFromChecks(
  checks: readonly ModuleId[],
  options: { readonly isVenueRequirements?: boolean } = {},
): DocRole {
  if (options.isVenueRequirements) return "venue-requirements";
  if (checks.includes("presubmit") || checks.includes("cite")) return "manuscript";
  if (checks.includes("bibcheck")) return "bibliography";
  if (checks.includes("glossary")) return "glossary";
  return "unknown";
}
