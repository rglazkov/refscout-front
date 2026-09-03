import { openDB, type IDBPDatabase } from "idb";

import type { ClientEvent } from "./events";

/**
 * Where an event waits until the receiver has confirmed it.
 *
 * A store of its own, in a database of its own, written by this module and by
 * nothing else. Events hold numbers, flags and codes and never a character of a
 * document, so the separation is not about what could leak out of here - it is
 * about what could get in: a queue sharing a store with the documents would be
 * one careless write away from carrying a manuscript to a server.
 *
 * A record leaves only on a confirmed send, never on an attempted one. The
 * difference shows up exactly where it matters: a connection that drops while
 * the answer is on its way would otherwise erase the event the server never
 * received.
 */
const DATABASE = "refscout-telemetry";
const STORE = "events";
const VERSION = 1;

/**
 * How many distinct events one session may put here. One error inside a render
 * loop otherwise turns into a storm of requests that takes down the receiver
 * first and the tab second; identical ones are collapsed before they get this
 * far, so the ceiling is on how many *different* things went wrong.
 */
export const SESSION_CAP = 200;

/**
 * Whether this browser has the storage at all. A private window may answer with
 * nothing, and a queue that cannot be written is a queue that lives in the tab
 * for as long as the tab does - which is a smaller loss than any of the other
 * things a missing database could be made to mean.
 */
function available(): boolean {
  return typeof indexedDB !== "undefined";
}

let db: Promise<IDBPDatabase> | null = null;

function database(): Promise<IDBPDatabase> {
  db ??= openDB(DATABASE, VERSION, {
    upgrade(created) {
      created.createObjectStore(STORE, { keyPath: "id" });
    },
  });
  return db;
}

/**
 * Every write goes through here, and every write is swallowed.
 *
 * Two rules of this module meet in one function. Failures inside collection are
 * never reported, because reporting one would be another event, and an event
 * that fails to be stored would report itself for ever. And writes are chained
 * rather than fired in parallel, so a burst of events cannot open a dozen
 * transactions that overwrite each other's counts.
 */
let chain: Promise<void> = Promise.resolve();

function write(work: (open: IDBPDatabase) => Promise<void>): Promise<void> {
  if (!available()) return Promise.resolve();
  chain = chain.then(async () => {
    try {
      await work(await database());
    } catch {
      // Deliberately silent - see above.
    }
  });
  return chain;
}

/** Saves one event, or raises the count of the one it is identical to. */
export function enqueue(event: ClientEvent): Promise<void> {
  return write(async (open) => {
    const transaction = open.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    const existing = (await store.get(event.id)) as ClientEvent | undefined;
    await store.put(
      existing === undefined ? event : { ...existing, count: existing.count + 1 },
    );
    await transaction.done;
  });
}

/** Everything waiting, oldest first: the order it was collected in is the order it goes. */
export async function queued(): Promise<readonly ClientEvent[]> {
  if (!available()) return [];
  try {
    // After the writes already in hand, so an event collected a moment ago is
    // part of the answer rather than the one thing a reload loses.
    await chain;
    const all = (await (await database()).getAll(STORE)) as ClientEvent[];
    return all.sort((one, other) => one.ts.localeCompare(other.ts));
  } catch {
    return [];
  }
}

/** Called on a confirmed send, and on nothing else. */
export function forget(ids: readonly string[]): Promise<void> {
  return write(async (open) => {
    const transaction = open.transaction(STORE, "readwrite");
    for (const id of ids) await transaction.objectStore(STORE).delete(id);
    await transaction.done;
  });
}

/**
 * Empties the queue. Two gestures reach it and both are gestures of privacy:
 * turning automatic collection off, and signing out. Working actions do not -
 * "New check" and "Clear all" remove documents and findings, and clearing the
 * events of the run that has just ended, at the moment the next one starts,
 * would lose them exactly where they are most wanted.
 */
export function drop(): Promise<void> {
  return write(async (open) => {
    await open.clear(STORE);
  });
}
