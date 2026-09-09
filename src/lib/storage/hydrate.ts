import {
  type DocContent,
  type IntakeDraft,
  type Place,
  type RunIntent,
  type TextChange,
} from "@/lib/domain";

import { announceDiscarded, unavailable } from "./mode";
import { available, migrationDiscarded } from "./db";
import { type DocumentRecord, type JournalRecord } from "./documents";
import { type StoredBody, type StoredMarks } from "./results";
import {
  type StoredJob,
  type StoredRegions,
  type StoredSnapshot,
  type StoredView,
} from "./session";
import {
  DRAFT_KEY,
  INTENT_KEY,
  JOB_KEY,
  MANUAL_KEY,
  MARKS_KEY,
  VIEW_KEY,
  docIdOf,
  kindOf,
} from "./records";
import { abandoned } from "./sweep";
import { readAll } from "./writer";

/**
 * Everything the database has, read once as the application starts.
 *
 * There is one way back in and it is this: the address bar holds nothing, no
 * link carries a job, and it makes no difference whether the tab was reloaded
 * with F5, restored by the browser, or came back from the sign-in page or from
 * the payment provider. All of those are the same start, and all of them find
 * the same work where it was left. Somebody who bought Pro for the sake of one
 * check comes back to their buffer rather than to an empty screen.
 */

export type RestoredDocument = {
  readonly docId: string;
  readonly content: DocContent;
  readonly head: {
    readonly revision: number;
    readonly seq: number;
    readonly chars: number;
    readonly entries: number;
  };
};

export type Restored = {
  readonly documents: readonly RestoredDocument[];
  /** The card of each document, as the buffer store held it. */
  readonly cards: readonly unknown[];
  readonly job: StoredJob | null;
  readonly intent: RunIntent | null;
  readonly draft: IntakeDraft | null;
  readonly view: StoredView | null;
  readonly snapshots: ReadonlyMap<string, StoredSnapshot>;
  readonly edits: ReadonlyMap<string, StoredRegions>;
  readonly bodies: readonly StoredBody[];
  readonly marks: StoredMarks | null;
  readonly manual: ReadonlyArray<readonly [string, Place]>;
  /**
   * The documents nobody has touched inside the keeping period. They are left
   * out of everything above and handed back so that the sweep can remove them,
   * which is the one place the period is acted on.
   */
  readonly stale: readonly string[];
};

const empty: Restored = {
  documents: [],
  cards: [],
  job: null,
  intent: null,
  draft: null,
  view: null,
  snapshots: new Map(),
  edits: new Map(),
  bodies: [],
  marks: null,
  manual: [],
  stale: [],
};

/**
 * Puts a document's text back together: the last whole copy that was written,
 * with every transaction recorded after it replayed over the top.
 *
 * The replay runs from the last change of a transaction to the first, because
 * all of them were measured against the text as it stood before any of them.
 * Going forwards would leave the later ones describing positions the earlier
 * ones have already moved.
 */
export function replay(text: string, journal: readonly JournalRecord[]): string {
  let current = text;
  for (const entry of journal) {
    const changes = [...entry.changes];
    for (let at = changes.length - 1; at >= 0; at -= 1) {
      const change = changes[at];
      if (change === undefined) continue;
      if (change.from < 0 || change.to > current.length || change.from > change.to) {
        // A journal that does not fit the text it is replayed over describes
        // another revision of the document. The last whole copy is the true
        // thing that can still be said, so the replay stops there rather than
        // producing a text nobody ever typed.
        return current;
      }
      current = current.slice(0, change.from) + change.insert + current.slice(change.to);
    }
  }
  return current;
}

export async function hydrate(): Promise<Restored> {
  // A browser with no IndexedDB at all - a private window, or one with storage
  // switched off. The application works entirely in the tab from here, and the
  // screen says so: it is the first moment we can know, and the last moment at
  // which saying nothing would still be honest.
  if (!available()) {
    unavailable("absent");
    return empty;
  }

  const [documentRows, sessionRows, resultRows] = await Promise.all([
    readAll("documents"),
    readAll("session"),
    readAll("results"),
  ]);

  if (migrationDiscarded()) announceDiscarded();

  const stale = new Set(
    abandoned(documentRows as unknown as readonly DocumentRecord[], Date.now()),
  );

  const docs = new Map<string, DocumentRecord>();
  const journals = new Map<string, JournalRecord[]>();
  const cards: unknown[] = [];

  for (const row of documentRows) {
    const kind = kindOf(row.key);
    if (stale.has((row as { docId?: string }).docId ?? "")) continue;
    if (kind === "doc") docs.set((row as DocumentRecord).docId, row as DocumentRecord);
    else if (kind === "card") cards.push((row as unknown as { item: unknown }).item);
    else if (kind === "log") {
      const entry = row as JournalRecord;
      const list = journals.get(entry.docId) ?? [];
      list.push(entry);
      journals.set(entry.docId, list);
    }
  }

  const documents: RestoredDocument[] = [];
  for (const [docId, record] of docs) {
    const journal = (journals.get(docId) ?? [])
      .filter((entry) => entry.revision > record.snapshotRevision)
      .sort((left, right) => left.seq - right.seq);
    const text = replay(record.text, journal);
    const last = journal.at(-1);
    documents.push({
      docId,
      content: {
        text,
        originalSha256: record.originalSha256,
        ...(record.pages === undefined ? {} : { pages: record.pages }),
        ...(record.bibEntries === undefined ? {} : { bibEntries: record.bibEntries }),
        ...(record.meta === undefined ? {} : { meta: record.meta }),
        hadBom: record.hadBom,
        eol: record.eol,
      },
      head: {
        revision: last?.revision ?? record.snapshotRevision,
        seq: last?.seq ?? 0,
        chars: journal.reduce(
          (sum, entry) => sum + entry.changes.reduce(insertedLength, 0),
          0,
        ),
        entries: journal.length,
      },
    });
  }

  let job: StoredJob | null = null;
  let intent: RunIntent | null = null;
  let draft: IntakeDraft | null = null;
  let view: StoredView | null = null;
  const snapshots = new Map<string, StoredSnapshot>();
  const edits = new Map<string, StoredRegions>();

  for (const row of sessionRows) {
    switch (kindOf(row.key)) {
      case JOB_KEY:
        job = row as unknown as StoredJob;
        break;
      case INTENT_KEY:
        intent = (row as unknown as { intent: RunIntent }).intent;
        break;
      case DRAFT_KEY:
        draft = row as unknown as IntakeDraft;
        break;
      case VIEW_KEY:
        view = row as unknown as StoredView;
        break;
      case "snap":
        snapshots.set(docIdOf(row.key), row as unknown as StoredSnapshot);
        break;
      case "edits":
        edits.set(
          docIdOf(row.key),
          (row as unknown as { regions: StoredRegions }).regions,
        );
        break;
      default:
        break;
    }
  }

  const bodies: StoredBody[] = [];
  let marks: StoredMarks | null = null;
  let manual: ReadonlyArray<readonly [string, Place]> = [];

  for (const row of resultRows) {
    switch (kindOf(row.key)) {
      case "body":
        bodies.push(row as unknown as StoredBody);
        break;
      case MARKS_KEY:
        marks = row as unknown as StoredMarks;
        break;
      case MANUAL_KEY:
        manual = (row as unknown as { places: ReadonlyArray<readonly [string, Place]> })
          .places;
        break;
      default:
        break;
    }
  }

  return {
    documents,
    cards,
    job,
    intent,
    draft,
    view,
    snapshots,
    edits,
    bodies: bodies.filter((body) => !stale.has(body.docId)),
    marks,
    manual,
    stale: [...stale],
  };
}

function insertedLength(sum: number, change: TextChange): number {
  return sum + change.insert.length;
}
