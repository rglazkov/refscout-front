"use client";

import * as React from "react";

/**
 * The one width question the editor cannot answer in CSS.
 *
 * Almost everything that changes with the screen changes by a class, and that
 * is where it belongs. The card of the open finding is the exception: on a wide
 * screen it is a block placed inside the document by the editor itself, and on
 * a phone it is a panel pinned below the text - a block dropped into a column
 * forty characters wide would push the very sentence it is about off the
 * screen. Which of the two is built is decided before anything is drawn, so the
 * question has to be asked in script.
 *
 * The breakpoint is the one the layout uses, written the same way: the panel
 * beside the text appears at `sm`, and the card follows it rather than keeping
 * a width of its own that would drift away from the layout it stands in.
 */
const WIDE = "(min-width: 40rem)";

/** Asked for once per tab: the browser keeps the answer, and so do we. */
let query: MediaQueryList | null = null;

function media(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  query ??= window.matchMedia(WIDE);
  return query;
}

function subscribe(onChange: () => void): () => void {
  const watched = media();
  if (watched === null) return () => undefined;
  watched.addEventListener("change", onChange);
  return () => watched.removeEventListener("change", onChange);
}

function narrowNow(): boolean {
  const watched = media();
  return watched === null ? false : !watched.matches;
}

/*
 * Narrow where the width is not known, which is the server and nowhere else.
 * That is the layout that fits both: a pinned panel on a wide screen is merely
 * in an unusual place for one paint, while a block widget opened on a phone
 * moves the text under the reader's eyes.
 */
const narrowUntilMeasured = (): boolean => true;

export function useNarrowScreen(): boolean {
  return React.useSyncExternalStore(subscribe, narrowNow, narrowUntilMeasured);
}
