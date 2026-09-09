/**
 * The keys of everything written, gathered in one file.
 *
 * Two kinds of record share the `documents` store - the document itself and the
 * journal of edits made to it since the text was last written whole - so the
 * key carries its own prefix rather than the store implying it. Reading is then
 * a single pass over a store, sorted into kinds by these functions, and a
 * document's journal is the range of keys under its own prefix.
 */

/** The live text of one document, with everything read out of the file. */
export function documentKey(docId: string): string {
  return `doc:${docId}`;
}

/** The description the card is drawn from: ticks, options, companions, state. */
export function cardKey(docId: string): string {
  return `card:${docId}`;
}

/**
 * One transaction of the editor. The sequence number is padded so that the keys
 * sort the way the edits happened - IndexedDB orders strings, and `log:9` after
 * `log:10` would replay a paragraph before the word it was typed into.
 */
export function journalKey(docId: string, seq: number): string {
  return `log:${docId}:${String(seq).padStart(12, "0")}`;
}

export function journalPrefix(docId: string): string {
  return `log:${docId}:`;
}

/** What was sent for one document: a hash, a length and a conversion index. */
export function snapshotKey(docId: string): string {
  return `snap:${docId}`;
}

/** What has been typed into one document since it was sent. */
export function editsKey(docId: string): string {
  return `edits:${docId}`;
}

/** The body one module returned for one document. */
export function bodyKey(docId: string, module: string): string {
  return `body:${docId}:${module}`;
}

/** The single records of the session and of the results. */
export const JOB_KEY = "job";
export const INTENT_KEY = "intent";
export const DRAFT_KEY = "draft";
export const VIEW_KEY = "view";
export const MARKS_KEY = "marks";
export const MANUAL_KEY = "manual";

/** Which kind of record a key names, for the pass made at start-up. */
export function kindOf(key: string): string {
  const at = key.indexOf(":");
  return at === -1 ? key : key.slice(0, at);
}

/** The document a prefixed key belongs to. */
export function docIdOf(key: string): string {
  const first = key.indexOf(":");
  if (first === -1) return "";
  const second = key.indexOf(":", first + 1);
  return second === -1 ? key.slice(first + 1) : key.slice(first + 1, second);
}
