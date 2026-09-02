"use client";

import * as React from "react";

/**
 * One clock for the whole progress screen.
 *
 * Every running stage shows how long it has been going, and a timer per stage
 * means fifty timers on a buffer of fifty documents - fifty wake-ups a second,
 * each re-rendering one row. There is only ever one second to tell, so it is
 * told once: a single interval publishes the current time and every row reads
 * it.
 *
 * The interval is shared rather than per subscriber, and it stops when the last
 * reader goes away, so a finished job leaves nothing ticking behind it.
 */
let listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let current = Date.now();

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  timer ??= setInterval(() => {
    current = Date.now();
    for (const listener of listeners) listener();
  }, 1000);

  return () => {
    listeners.delete(notify);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The current second, shared by every row that needs it. */
export function useNow(): number {
  return React.useSyncExternalStore(
    subscribe,
    () => current,
    // The server has no clock of its own to disagree with: this renders in the
    // browser only, and a fixed value keeps hydration quiet.
    () => 0,
  );
}

/** `m:ss` from a duration in milliseconds; negative durations read as zero. */
export function asMinutesAndSeconds(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** For the tests: nothing is left ticking between them. */
export function stopClock(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  listeners = new Set();
}
