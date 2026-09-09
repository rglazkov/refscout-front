import {
  type BibSpan,
  type DocContent,
  type DocMeta,
  type PageSpan,
  type TextChange,
} from "@/lib/domain";

import { documentKey, journalKey, journalPrefix } from "./records";
import { requestPersistence } from "./persist";
import { type StoredRecord } from "./db";
import { commit } from "./writer";

/**
 * The text of every document, held in the memory of the tab and written to
 * IndexedDB behind it.
 *
 * The memory copy is not a cache of the database - it is the mirror the screens
 * read, and it is what lets the registry stay the four synchronous operations
 * it was written as while the store behind it became asynchronous. A read is
 * answered from the mirror, and a write goes to the mirror and to the database
 * in the same turn.
 *
 * There is exactly one copy of a document's live text in the database: the
 * record below. The text as it was extracted is a hash, and the snapshot of
 * what was sent is a hash and a length. A three-million-character manuscript is
 * about six megabytes in the browser's own units, and keeping the original and
 * the sent copy beside the live one would cost eighteen where six is enough.
 */

/** What the journal is allowed to grow to before the text is written whole. */
const JOURNAL_ENTRIES = 200;

/** And how many characters of typing, whichever ceiling is reached first. */
const JOURNAL_CHARS = 64 * 1024;

export type DocumentRecord = StoredRecord & {
  readonly docId: string;
  readonly text: string;
  readonly originalSha256: string;
  readonly pages?: readonly PageSpan[];
  readonly bibEntries?: readonly BibSpan[];
  readonly meta?: DocMeta;
  readonly hadBom: boolean;
  readonly eol: DocContent["eol"];
  /** The revision the text above is the text of. */
  readonly snapshotRevision: number;
  readonly at: number;
};

export type JournalRecord = StoredRecord & {
  readonly docId: string;
  readonly seq: number;
  readonly revision: number;
  readonly changes: readonly TextChange[];
  readonly at: number;
};

/** What the tab knows about a document beyond its content. */
type Head = {
  revision: number;
  seq: number;
  /** Characters written into the journal since the text was last written whole. */
  chars: number;
  entries: number;
};

const contents = new Map<string, DocContent>();
const heads = new Map<string, Head>();

function headOf(docId: string): Head {
  let head = heads.get(docId);
  if (head === undefined) {
    head = { revision: 0, seq: 0, chars: 0, entries: 0 };
    heads.set(docId, head);
  }
  return head;
}

function recordOf(docId: string, content: DocContent, head: Head): DocumentRecord {
  return {
    key: documentKey(docId),
    docId,
    text: content.text,
    originalSha256: content.originalSha256,
    ...(content.pages === undefined ? {} : { pages: content.pages }),
    ...(content.bibEntries === undefined ? {} : { bibEntries: content.bibEntries }),
    ...(content.meta === undefined ? {} : { meta: content.meta }),
    hadBom: content.hadBom,
    eol: content.eol,
    snapshotRevision: head.revision,
    at: Date.now(),
  };
}

/** Writes the text whole and drops the journal it makes redundant. */
function writeWhole(docId: string, content: DocContent): Promise<void> {
  const head = headOf(docId);
  head.chars = 0;
  head.entries = 0;
  const record = recordOf(docId, content, head);
  return commit((stores) => {
    stores.documents.put(record);
    stores.documents.deleteUnder(journalPrefix(docId));
  });
}

/**
 * The store behind the text registry.
 *
 * `put` is every arrival of a document and every recomputation over it - an
 * extraction finishing, a bibliography being read again - and each writes the
 * text whole, because each replaces it whole. `edit` is the editor, and it
 * writes what changed instead.
 */
export const indexedDbDocuments = {
  get: (docId: string): DocContent | undefined => contents.get(docId),

  put: (docId: string, content: DocContent): void => {
    contents.set(docId, content);
    // The moment a document appears in the buffer is the moment to ask the
    // browser to keep this origin: the request explains itself, where the same
    // one arriving on an empty screen reads as nagging and gets refused. It
    // asks once per tab and a refusal blocks nothing.
    void requestPersistence();
    void writeWhole(docId, content);
  },

  /**
   * One transaction of the editor, written as what it changed.
   *
   * The temptation is to keep the edits and write the string on a timer, and it
   * is wrong in the second half rather than the first: six megabytes cannot be
   * rewritten per keystroke, but what follows from that is "write something
   * other than the string", not "write later". A transaction is a few dozen
   * bytes, so it is written now, and the string is rewritten when the journal
   * has grown enough to be worth replacing.
   *
   * The window in which an applied and already visible edit lives only in this
   * tab is therefore the latency of the commit, and nothing widens it: no
   * timer, no debounce, no waiting for the person to stop typing.
   */
  edit: (docId: string, content: DocContent, changes: readonly TextChange[]): void => {
    contents.set(docId, content);
    const head = headOf(docId);
    head.revision += 1;
    head.seq += 1;
    head.entries += 1;
    for (const change of changes) head.chars += change.insert.length;

    if (head.entries >= JOURNAL_ENTRIES || head.chars >= JOURNAL_CHARS) {
      void writeWhole(docId, content);
      return;
    }

    const record: JournalRecord = {
      key: journalKey(docId, head.seq),
      docId,
      seq: head.seq,
      revision: head.revision,
      changes,
      at: Date.now(),
    };
    void commit((stores) => {
      stores.documents.put(record);
    });
  },

  remove: (docId: string): void => {
    contents.delete(docId);
    heads.delete(docId);
    void commit((stores) => {
      stores.documents.delete(documentKey(docId));
      stores.documents.deleteUnder(journalPrefix(docId));
    });
  },

  clear: (): void => {
    contents.clear();
    heads.clear();
    void commit((stores) => {
      // Everything, and not only the documents: "Clear all", "New check" and
      // signing out all mean the same thing, and a result or a mark outliving
      // the text it was made about describes a manuscript nothing on screen can
      // reach any more.
      stores.documents.clear();
      stores.session.clear();
      stores.results.clear();
    });
  },

  keys: (): readonly string[] => [...contents.keys()],
} as const;

/**
 * Writes whole every document whose journal has grown since the text was last
 * written. It is called where a tab is about to be put away - the moment a
 * mobile browser may kill it without another word - and nowhere else, because
 * everywhere else the journal is already on disk.
 */
export function flushJournals(): void {
  for (const [docId, head] of heads) {
    if (head.entries === 0) continue;
    const content = contents.get(docId);
    if (content === undefined) continue;
    void writeWhole(docId, content);
  }
}

/**
 * Puts back what was read out of the database at start-up, without writing any
 * of it back down again.
 */
export function seedDocuments(
  restored: ReadonlyMap<string, { readonly content: DocContent; readonly head: Head }>,
): void {
  contents.clear();
  heads.clear();
  for (const [docId, entry] of restored) {
    contents.set(docId, entry.content);
    heads.set(docId, { ...entry.head });
  }
}

/** The revision of a document as this tab has it. Read by the tests. */
export function revisionOf(docId: string): number {
  return heads.get(docId)?.revision ?? 0;
}
