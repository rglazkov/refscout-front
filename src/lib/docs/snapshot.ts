/**
 * What was sent, kept as two numbers per document.
 *
 * When a module answers, the body declares the documents its coordinates were
 * counted over, with the hash and the length the server recomputed from the
 * text it received. That is only proof of anything if we still know what we
 * sent - and by then the text may have been corrected twice, so the hash of the
 * document as it now stands answers a different question.
 *
 * It is two short strings per document rather than a copy of the text: a copy
 * would be a second instance of somebody's unpublished manuscript, kept for the
 * sake of a comparison that a hash settles. It lives outside React for the same
 * reason the texts do - what a store holds reaches serialised state and error
 * reports - and beside the registry rather than inside it, because it describes
 * a moment that has passed rather than the document as it is.
 */
export type TextSnapshot = {
  readonly textSha256: string;
  readonly cpLength: number;
  /**
   * The positions of the characters that take two units of a JavaScript string,
   * as the sent text counted them. It is here rather than recomputed later for
   * the same reason the hash is: by the time an answer arrives the text may have
   * been corrected twice, and an index taken over the corrected text would
   * convert the answer's offsets by the wrong amounts. It is a few numbers on
   * ordinary prose and nothing at all on text that has none.
   */
  readonly astral: Uint32Array | null;
};

const snapshots = new Map<string, TextSnapshot>();

/**
 * Told whenever a snapshot appears or goes, so that it can be written down
 * beside the document it describes. It is a hook rather than an import because
 * the registry knows nothing about where anything is kept - which is the same
 * reason it has an adapter at all.
 */
let observer: (docId: string, snapshot: TextSnapshot | null) => void = () => {};

export function observeSnapshots(
  next: (docId: string, snapshot: TextSnapshot | null) => void,
): void {
  observer = next;
}

/** Recorded as the submission is assembled, for every document that goes out. */
export function recordSnapshot(docId: string, snapshot: TextSnapshot): void {
  snapshots.set(docId, snapshot);
  observer(docId, snapshot);
}

export function snapshotDocIds(): readonly string[] {
  return [...snapshots.keys()];
}

export function snapshotOf(docId: string): TextSnapshot | undefined {
  return snapshots.get(docId);
}

/** Puts back what a previous session recorded as it sent each document. */
export function restoreSnapshot(docId: string, snapshot: TextSnapshot): void {
  snapshots.set(docId, snapshot);
}

export function forgetSnapshot(docId: string): void {
  snapshots.delete(docId);
  observer(docId, null);
}

export function clearSnapshots(): void {
  snapshots.clear();
}
