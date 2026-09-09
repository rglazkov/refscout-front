/**
 * Where the work is kept between sessions.
 *
 * The extracted text is the only copy of a document in existence: the file on
 * disk was read and let go, and by the design of the product no copy of it was
 * ever sent anywhere. In an ordinary application losing state is an annoyance;
 * here it destroys the only instance of somebody's unpublished manuscript. That
 * one sentence decides everything in this directory - what is written, when it
 * is written, and what is said on screen when the browser will not let us write
 * at all.
 *
 * The door is narrow on purpose. The screens know three things about storage:
 * whether it is durable, how to wait for what has been written, and how to
 * remove everything. The shapes of the records, the schema and its migrations,
 * the journal, the sweep and the connection live behind it.
 */
export { available, closeDatabase, DATABASE, storeNames, VERSION } from "./db";
export {
  isQuotaFailure,
  resetStorageMode,
  storageMode,
  subscribeToStorage,
  unavailable,
  type StorageFault,
  type StorageMode,
} from "./mode";
export {
  clearStores,
  commit,
  guardWrites,
  readAll,
  settled,
  type Write,
  type WriteTarget,
} from "./writer";
export {
  flushJournals,
  indexedDbDocuments,
  revisionOf,
  seedDocuments,
  type DocumentRecord,
  type JournalRecord,
} from "./documents";
export { forgetCards, writeCards } from "./cards";
export {
  writeDraft,
  writeEdits,
  writeIntent,
  writeJob,
  writeSnapshot,
  writeView,
  type StoredJob,
  type StoredRegions,
  type StoredSnapshot,
  type StoredView,
} from "./session";
export {
  writeBody,
  writeManualPlaces,
  writeMarks,
  type StoredBody,
  type StoredMarks,
} from "./results";
export { useStorageMode } from "./use-storage";
export { persistenceGranted, reportPressure, requestPersistence } from "./persist";
export { abandoned, KEEP_DAYS, sweep } from "./sweep";
export { hydrate, replay, type Restored, type RestoredDocument } from "./hydrate";
