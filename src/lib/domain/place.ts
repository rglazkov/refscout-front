import { type DocOffset } from "./offsets";

/**
 * How a place a module sent ended up on the text in front of the person. It is
 * the result of resolving an anchor, not a field of any answer: the server
 * sends coordinates over the text it was given, and what comes of them on the
 * live document is worked out here.
 *
 * The status exists because failing to place a finding has to be visible. A
 * function that returned a range and nothing else would, on a miss, return the
 * wrong range - a highlight that looks exactly like a correct one and stands in
 * the wrong paragraph. One highlight in the wrong place costs the trust in
 * every other, because the reader has no way to check them; so a miss returns
 * `lost`, the finding keeps its card, and the share of misses per module is a
 * number rather than a letter to support.
 */
export const placeStatuses = [
  /** The coordinates held the quoted text: the ordinary path. */
  "exact",
  /** They did not, and the fragment was found by its own text and neighbours. */
  "relocated",
  /** Worked out from our own map: the entry of a bibliography a key names. */
  "derived",
  /** The person pointed at it themselves after nothing else could. */
  "manual",
  /** The finding has no address by its nature, which is not a failure. */
  "none",
  /** An address was offered and did not resolve. This one is a failure. */
  "lost",
] as const;

export type PlaceStatus = (typeof placeStatuses)[number];

/**
 * Why a place did not resolve, in a closed list. It goes on the card only as a
 * choice of sentence and travels to telemetry as a code, never with a fragment
 * of the text beside it.
 */
export const placeFailures = [
  /** The offsets were outside the document, or were not whole numbers at all. */
  "OUT_OF_BOUNDS",
  /** The quote was not as long as the range it described. */
  "QUOTE_LENGTH_MISMATCH",
  /** Too short to index and with no context to lengthen it: the module's defect. */
  "ANCHOR_KEY_TOO_SHORT",
  /** Searched for and not found. */
  "NOT_FOUND",
  /** Found in more than one place, and guessing between them is not allowed. */
  "AMBIGUOUS",
  /** The pass ran out of its budget before reaching this place. */
  "ANCHOR_BUDGET",
] as const;

export type PlaceFailure = (typeof placeFailures)[number];

export type Place = {
  readonly status: PlaceStatus;
  /** Which document it is in: a finding on a manuscript may point at its bibliography. */
  readonly docId: string;
  /**
   * The point the jump goes to. It survives every edit, including one that
   * deletes the whole paragraph around it, which is why it is separate from the
   * range: the highlight goes and the way to the place stays. Absent on exactly
   * `none` and `lost` - there is no address, and a zero here would send every
   * such jump to the top of the document.
   */
  readonly anchor?: DocOffset;
  /**
   * What is highlighted. It goes when an edit crosses it: the module judged
   * text that is no longer there, and keeping the highlight would be a claim
   * about characters the person has replaced.
   */
  readonly range?: { readonly from: DocOffset; readonly to: DocOffset };
  /** The text was edited here: the highlight is gone and the card says so. */
  readonly edited?: boolean;
  /** The entry of a bibliography this place names, for the label on the card. */
  readonly bibkey?: string;
  /** What the module quoted, kept for the card and for resolving it again. */
  readonly quote?: string;
  readonly failure?: PlaceFailure;
};

/** Whether this place can be jumped to and, unless edited, highlighted. */
export function isResolved(place: Place): boolean {
  return place.status !== "none" && place.status !== "lost";
}
