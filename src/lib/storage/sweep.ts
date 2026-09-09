import { documentKey, journalPrefix, kindOf } from "./records";
import { type DocumentRecord, type JournalRecord } from "./documents";
import { bodyKey, cardKey, editsKey, snapshotKey } from "./records";
import { commit } from "./writer";

/**
 * What is swept away, and why the period is described the way it is.
 *
 * Documents live until they are removed. What has not been touched in thirty
 * days is removed by the check made when the application starts - and that is a
 * ceiling on our own keeping, not a promise about the browser's. The browser
 * evicts a database when it is short of room, clears storage of sites it has
 * not seen in a while, and may keep nothing at all in a private window. So an
 * empty store at start-up is an ordinary start rather than a fault, and nowhere
 * in the interface is anybody told their documents will be waiting.
 */

export const KEEP_DAYS = 30;

const KEEP_MS = KEEP_DAYS * 24 * 60 * 60 * 1000;

/**
 * The documents whose last touch is older than the period, given everything
 * read out of the `documents` store. A journal entry counts as a touch: it is
 * the record of somebody typing, and the whole text is only rewritten now and
 * then.
 */
export function abandoned(
  records: readonly (DocumentRecord | JournalRecord)[],
  now: number,
): readonly string[] {
  const touched = new Map<string, number>();
  const known = new Set<string>();
  for (const record of records) {
    const at = typeof record.at === "number" ? record.at : 0;
    touched.set(record.docId, Math.max(touched.get(record.docId) ?? 0, at));
    if (kindOf(record.key) === "doc") known.add(record.docId);
  }
  return [...known].filter((docId) => now - (touched.get(docId) ?? 0) > KEEP_MS);
}

/**
 * Removes a document and everything written about it. It is the same removal a
 * person makes from the card, so it takes the same things with it: the card,
 * the text, the journal, what was sent, what has been typed since, and the
 * bodies the modules returned about it.
 */
export function sweep(
  docIds: readonly string[],
  modules: readonly string[],
): Promise<void> {
  if (docIds.length === 0) return Promise.resolve();
  return commit((stores) => {
    for (const docId of docIds) {
      stores.documents.delete(documentKey(docId));
      stores.documents.delete(cardKey(docId));
      stores.documents.deleteUnder(journalPrefix(docId));
      stores.session.delete(snapshotKey(docId));
      stores.session.delete(editsKey(docId));
      for (const moduleId of modules) stores.results.delete(bodyKey(docId, moduleId));
    }
  });
}
