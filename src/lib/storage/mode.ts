/**
 * Whether the browser is giving us storage, and what to say when it is not.
 *
 * Three different things end in the same place: a private window that has no
 * IndexedDB to give, a quota that ran out in the middle of the work, and a
 * browser where the database will not open. In all three the application keeps
 * working entirely in the memory of the tab - the text on screen is not taken
 * away from anybody - and says plainly that this state will not survive a
 * reload, which is the sentence that makes downloading the result the obvious
 * next move.
 *
 * A refusal of a write is never swallowed. Silently losing a write is the one
 * outcome that is not allowed here: it looks exactly like working, and the
 * person finds out after the manuscript is gone.
 */

export type StorageFault = "absent" | "quota";

export type StorageMode = {
  /** Whether what is written now outlives the tab. */
  readonly durable: boolean;
  readonly fault: StorageFault | null;
  /**
   * Set when the database was opened by a build whose schema could not carry
   * the stored documents forward. It is not a fault - storage works - but it is
   * a loss the person is owed a sentence about.
   */
  readonly discarded: boolean;
};

let mode: StorageMode = { durable: true, fault: null, discarded: false };

const listeners = new Set<() => void>();

export function storageMode(): StorageMode {
  return mode;
}

export function subscribeToStorage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(next: StorageMode): void {
  if (
    next.durable === mode.durable &&
    next.fault === mode.fault &&
    next.discarded === mode.discarded
  ) {
    return;
  }
  mode = next;
  for (const listener of listeners) listener();
}

/**
 * The browser stopped storing, for one of the two reasons there are. The first
 * one wins: a quota that ran out after the database had already refused to open
 * describes the same tab, and the first sentence is the true one.
 */
export function unavailable(fault: StorageFault, cause?: unknown): void {
  if (!mode.durable) return;
  if (cause !== undefined && typeof console !== "undefined") {
    // Not a report: this is the browser's own refusal, it carries nothing about
    // any document, and the number that matters - how much room is left - goes
    // to telemetry from `pressure()` instead.
    console.warn("[storage] falling back to the memory of this tab", cause);
  }
  announce({ durable: false, fault, discarded: mode.discarded });
}

/** The stored documents could not be carried across a schema change. */
export function announceDiscarded(): void {
  announce({ ...mode, discarded: true });
}

/** Whether a refusal is the quota rather than anything else. */
export function isQuotaFailure(cause: unknown): boolean {
  return (
    cause instanceof DOMException &&
    (cause.name === "QuotaExceededError" ||
      // The name Firefox used before the standard one settled.
      cause.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

/** For tests, which need a tab that has not yet met a refusal. */
export function resetStorageMode(): void {
  mode = { durable: true, fault: null, discarded: false };
  for (const listener of listeners) listener();
}
