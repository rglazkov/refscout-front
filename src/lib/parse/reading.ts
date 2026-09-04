import { type BibSpan, type LocalFinding } from "@/lib/domain";

/**
 * What reading the structure of a bibliography or a LaTeX source produces,
 * beside the text itself.
 *
 * It is separate from the text on purpose. The document is the file as it was
 * written, and this is what we managed to understand about it - a map of where
 * the entries are, and the few problems a file can be seen to have without
 * anything being sent anywhere. Both are recomputed when the text is edited,
 * because a duplicate key the person has just removed must stop being reported
 * the moment they remove it.
 */
export type Reading = {
  readonly bibEntries: readonly BibSpan[];
  readonly localFindings: readonly LocalFinding[];
  /**
   * Whether the file read as a whole. A syntax the library could not finish is
   * not a refusal of the document: the text is accepted, the check runs on it
   * on the server as it always would, and what is switched off is this reading
   * and the map that comes from it.
   */
  readonly complete: boolean;
};

export function emptyReading(): Reading {
  return { bibEntries: [], localFindings: [], complete: true };
}

/**
 * The file did not read. The card says so in one line, so that an empty list of
 * local warnings is never mistaken for a clean bill of health, and the way out
 * of it is the editor - the person opens the text and sees where it broke.
 */
export function unreadable(): Reading {
  return {
    bibEntries: [],
    localFindings: [{ code: "BIB_UNREADABLE", severity: "info" }],
    complete: false,
  };
}
