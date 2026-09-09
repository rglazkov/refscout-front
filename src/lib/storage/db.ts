import { openDB, type IDBPDatabase, type IDBPTransaction } from "idb";

import { unavailable } from "./mode";

/**
 * The one database the product keeps, and the connection to it.
 *
 * The extracted text is the only copy of a document in existence - the file on
 * disk was read and let go, and nothing was sent anywhere - so what is written
 * here is not a cache of something that could be fetched again. It is the
 * document.
 *
 * Three stores in one database, because a text and the marks made on it are
 * committed together or not at all: an edit raises the document's revision and
 * moves the places pinned by hand in the same transaction, and two databases
 * cannot promise that. The queue of unsent telemetry is the one thing kept
 * apart, in a database of its own written by `lib/telemetry` and by nothing
 * else - the separation there is not about what could leak out but about what
 * could get in.
 */
export const DATABASE = "refscout";

/**
 * The stores, and what each holds.
 *
 * `documents` - the live text of every document, the description the card is
 * drawn from, and the journal of edits made since the last full write of the
 * text. `session` - what the run knows about itself: the job and its token, the
 * intention behind the press, the paste overlay's draft, what was sent and what
 * has been typed since. `results` - the body of every module that has answered,
 * the artifacts they wrote, the marks a person put on findings and the places
 * they pinned by hand.
 */
export const storeNames = ["documents", "session", "results"] as const;

export type StoreName = (typeof storeNames)[number];

/**
 * The shape of what is written. Every record carries its own key, so the
 * journal of a document and the document itself live in one store without one
 * needing a key path the other cannot satisfy.
 */
export type StoredRecord = { readonly key: string } & Record<string, unknown>;

/**
 * The version of the schema, and the steps between versions.
 *
 * Both exist from the first release with one version and no steps, which is the
 * point: an application that has updated under a person with a full database
 * either migrates what is there or discards it and says so, and both of those
 * have to be written before there is anything to migrate. A version arriving
 * with no step to reach it from is the second case - the stores are recreated
 * empty and the interface says the saved documents could not be carried over.
 */
export const VERSION = 1;

/**
 * What each step does to the data already there. The key is the version being
 * reached, so the step from 1 to 2 lives under `2`. A step that cannot be
 * written is simply absent, and absence means the honest deletion below.
 */
const migrations: Readonly<
  Record<number, (tx: IDBPTransaction<unknown, StoreName[], "versionchange">) => void>
> = {};

/** Set when a version was reached by discarding rather than by migrating. */
let discarded = false;

/** Whether the last open had to throw the stored documents away to start. */
export function migrationDiscarded(): boolean {
  return discarded;
}

/** Whether this browser has the storage at all. A private window may not. */
export function available(): boolean {
  return typeof indexedDB !== "undefined";
}

let connection: Promise<IDBPDatabase> | null = null;

/**
 * The open connection, held between writes and given up the moment it stops
 * being one.
 *
 * Holding it is what makes a write per keystroke affordable: opening the
 * database per edit would be a round trip per edit. Holding it for ever is the
 * defect. A connection is not ours to keep - the browser force-closes it when a
 * frozen tab's storage is reclaimed, and a neighbouring tab deleting the
 * database closes it too - and after that the handle is still an object, every
 * transaction on it throws, and the cache hands that same dead handle to every
 * later call for the life of the page. A tab returning from the background
 * would stop writing altogether, and only a reload would cure it.
 *
 * So both endings clear the cache and the next call opens again. A failed open
 * is cleared for the same reason: a rejected promise left in the cache is one
 * bad moment standing in for one bad connection.
 */
export function database(): Promise<IDBPDatabase> {
  connection ??= openDB(DATABASE, VERSION, {
    upgrade(created, from, to, tx) {
      for (const name of storeNames) {
        if (!created.objectStoreNames.contains(name)) {
          created.createObjectStore(name, { keyPath: "key" });
        }
      }
      // Every version between the one found and the one wanted, in order. A
      // gap means this build cannot carry that data forward, and carrying half
      // of it forward would be worse than starting empty.
      for (let version = from + 1; version <= (to ?? VERSION); version += 1) {
        const step = migrations[version];
        if (step === undefined) {
          if (from > 0) {
            discarded = true;
            for (const name of storeNames) {
              void tx.objectStore(name).clear();
            }
          }
          continue;
        }
        step(tx as IDBPTransaction<unknown, StoreName[], "versionchange">);
      }
    },
    // The browser ended it without being asked - this is the one that fires
    // when a tab comes back from being frozen and reclaimed.
    terminated() {
      connection = null;
    },
    // Another tab is opening a version this one cannot serve. Letting go is the
    // only answer that lets that tab start at all.
    blocking(_current, _blocked, event) {
      (event.target as IDBPDatabase | null)?.close();
      connection = null;
    },
  }).then(
    (open) => {
      open.addEventListener("close", () => {
        connection = null;
      });
      return open;
    },
    (cause: unknown) => {
      connection = null;
      unavailable("absent", cause);
      throw cause;
    },
  );
  return connection;
}

/** Lets go of the handle without waiting for the browser to take it. */
export function closeDatabase(): void {
  const open = connection;
  connection = null;
  void open?.then((db) => {
    db.close();
  });
}
