import { available, database, storeNames, type StoreName, type StoredRecord } from "./db";
import { isQuotaFailure, storageMode, unavailable } from "./mode";
import { reportPressure } from "./persist";

/**
 * How everything gets written, and the three rules that make the window in
 * which work can be lost as small as the browser allows.
 *
 * First, the window is not widened by time. A commit starts in the same
 * synchronous turn as the change that caused it: no timer, no debounce, no
 * waiting for the person to stop typing. What remains is the latency of the
 * commit itself, which is the browser's and not our choice.
 *
 * Second, an action by which the product says "done" waits for the transaction
 * to finish rather than to start. Closing the editor overlay, adding to the
 * buffer and running a check are the moments that tell somebody the tab can now
 * be closed, so they wait on `settled()`.
 *
 * Third, the right to write is handed to another tab only after the open
 * transactions have finished, which lives in `lib/tabs` and calls `settled()`
 * here.
 *
 * The transaction spans every store, always. A text and the coordinates over it
 * change together - an edit raises the revision, rewrites the maps and moves
 * the places pinned by hand - and a per-store write would let a reload find a
 * revision of one beside a revision of the other.
 */

/** A write, expressed as what it does to the three stores it is given. */
export type Write = (stores: Readonly<Record<StoreName, WriteTarget>>) => void;

/** The half of an object store a write is allowed to use. */
export type WriteTarget = {
  readonly put: (record: StoredRecord) => void;
  readonly delete: (key: string) => void;
  /**
   * Everything whose key starts with this prefix. A document's journal is a
   * range of keys under its own prefix, and dropping it a key at a time would
   * mean reading the range first only to delete what was just read.
   */
  readonly deleteUnder: (prefix: string) => void;
  readonly clear: () => void;
};

/**
 * What is currently on its way to the database. A promise rather than a count,
 * because what callers need is to wait for it - and the chain is what keeps two
 * writes made in one turn in the order they were made.
 */
let open: Promise<void> = Promise.resolve();

/**
 * The writes queued but not yet started, by the thing they are about.
 *
 * A slice that is written whole - the paste draft, the marks, the job - is
 * rewritten in full on every change, so a queued write of it is already out of
 * date the moment the next change arrives. Left alone they line up: typing
 * twenty characters into the draft queues twenty writes of the whole draft, and
 * a reload a moment later finds whichever of them had got through. That is not
 * the latency of a commit, it is the latency of twenty.
 *
 * So a queued write is replaced rather than followed. Nothing is delayed by
 * this - the commit still starts in the turn the change was made - and what is
 * dropped is only a value that was about to be overwritten anyway. Records that
 * are not a whole state pass no key and queue normally: the journal of an edit
 * is one transaction of the editor and the next one does not contain it.
 */
const queued = new Map<string, { write: Write }>();

/** Whether this tab may write at all. Set by `lib/tabs` as the role moves. */
let allowed: () => boolean = () => true;

/** What to do about a write refused because this tab is not the writing one. */
let refuse: () => void = () => {};

export function guardWrites(may: () => boolean, onRefusal: () => void): void {
  allowed = may;
  refuse = onRefusal;
}

/**
 * Applies one change to the database and gives back a promise of its commit.
 *
 * The promise never rejects. A write that cannot be made is a state of the
 * interface - the memory-of-this-tab notice, or the curtain of a tab that is
 * not the writing one - and a rejected promise here would turn each of those
 * into an unhandled error in somebody's console while the screen said nothing.
 */
export function commit(write: Write, replaces?: string): Promise<void> {
  if (!available() || !storageMode().durable) return open;
  if (!allowed()) {
    refuse();
    return open;
  }

  if (replaces !== undefined) {
    const standing = queued.get(replaces);
    if (standing !== undefined) {
      standing.write = write;
      return open;
    }
  }

  const slot = { write };
  if (replaces !== undefined) queued.set(replaces, slot);

  const done = open.then(async () => {
    // Released before the transaction opens, so a change made while this one is
    // being written queues a new write rather than editing one already running.
    if (replaces !== undefined) queued.delete(replaces);
    try {
      const db = await database();
      const tx = db.transaction([...storeNames], "readwrite");
      const targets = Object.fromEntries(
        storeNames.map((name) => {
          const store = tx.objectStore(name);
          return [
            name,
            {
              put: (record: StoredRecord) => void store.put(record),
              delete: (key: string) => void store.delete(key),
              deleteUnder: (prefix: string) =>
                // The upper bound is the prefix with its last character raised
                // by one, which is the first key that cannot be under it.
                void store.delete(IDBKeyRange.bound(prefix, `${prefix}￿`, false, false)),
              clear: () => void store.clear(),
            },
          ];
        }),
      ) as Readonly<Record<StoreName, WriteTarget>>;
      slot.write(targets);
      await tx.done;
    } catch (cause) {
      // The quota is the one refusal with a sentence of its own: the text stays
      // on screen and the tab keeps working, and the notice says the rest will
      // not survive a reload. Everything else means the database has stopped
      // being one, and the answer is the same working-in-memory state.
      const quota = isQuotaFailure(cause);
      unavailable(quota ? "quota" : "absent", cause);
      // How much room there was when it ran out. Pressure on the quota has to
      // be visible as a figure before it is visible as a letter to support.
      if (quota) void reportPressure();
    }
  });

  open = done;
  return done;
}

/**
 * Waits for everything already started. This is what an action saying "done"
 * waits on, and what a tab handing over the right to write waits on before it
 * lets the lock go.
 */
export async function settled(): Promise<void> {
  // The chain grows while it is being awaited: a keystroke landing between the
  // await and the resolution appends a link, and waiting for the link we
  // happened to see would let go one commit too early.
  let seen: Promise<void> | null = null;
  while (seen !== open) {
    seen = open;
    await seen;
  }
}

/** Reads the whole of one store. Used at start-up and by the tests. */
export async function readAll(name: StoreName): Promise<readonly StoredRecord[]> {
  if (!available()) return [];
  try {
    const db = await database();
    return (await db.getAll(name)) as StoredRecord[];
  } catch (cause) {
    unavailable("absent", cause);
    return [];
  }
}

/** Empties every store. What "Delete saved documents" and signing out call. */
export function clearStores(): Promise<void> {
  return commit((stores) => {
    for (const name of storeNames) stores[name].clear();
  });
}
