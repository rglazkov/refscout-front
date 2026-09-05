/**
 * How a finding gets from an answer onto the text a person is reading.
 *
 * Four things happen here and nowhere else: the offsets change unit, they catch
 * up with whatever has been typed since the text was sent, they are checked
 * against the words the module quoted, and - when the check fails - the fragment
 * is searched for. What comes out of it is a place with a status, so that a
 * failure to find one is visible instead of being a highlight in the wrong
 * paragraph.
 *
 * The door is deliberately narrow: the work itself runs in a worker, and this
 * is what both sides of that port are allowed to see.
 */
export {
  resolveAnchors,
  type ProjectedAnchor,
  type ResolveCounts,
  type ResolveIssue,
  type ResolveRequest,
  type ResolveResult,
} from "./resolve";
export { projectAnchor } from "./project";
export {
  anchoringCounts,
  clearManualPlace,
  forgetPlaces,
  moveManualPlaces,
  placeKey,
  placesInDocument,
  placesOfIssue,
  reresolveDocument,
  resolveBody,
  setManualPlace,
  type PlacedFinding,
} from "./session";
export { useDocumentPlaces, useIssuePlaces } from "./use-places";
export {
  astralIndex,
  cpLengthOf,
  toCpOffset,
  toDocOffset,
  withinDocument,
} from "./units";
export { foldedForm, foldedKey, nfcForm, type Rewritten } from "./forms";
export { buildIndex, MIN_KEY_LENGTH, occurrences, type TextIndex } from "./text-index";
