"use client";

import * as React from "react";

import { unavailable } from "@/lib/storage";
import { claimWriteRole } from "@/lib/tabs";
import { track } from "@/lib/telemetry";

import { restoreSession } from "./restore";
import { watchState } from "./subscribe";

/**
 * Whether the previous session has been read back yet.
 *
 * The screen waits for it. Drawing an empty buffer first and filling it a
 * moment later would show somebody that their documents are gone and then take
 * it back, and the read is one pass over a database on the same machine.
 *
 * The screen is drawn when the read fails too. A record this build cannot read
 * - one written by an earlier build in a shape this one does not expect -
 * makes the restoration throw, and a screen waiting on it would stay empty for
 * good, with no drop zone and no word about why. So a failed read puts the tab
 * into the memory-of-this-tab state: the screen appears with the notice that
 * says what is written now will not outlive the tab, and nothing is written
 * over the stored session, which stays in the database exactly as it was.
 * "Delete saved documents" still empties it.
 */
export function useRestoredSession(): boolean {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    const start = () => {
      if (!live) return;
      // The listeners are attached after the read, not before: attaching them
      // first would make the restoration itself look like a change and write
      // everything straight back down again.
      watchState();
      claimWriteRole();
      setReady(true);
    };
    void restoreSession().then(start, (cause: unknown) => {
      // Before the listeners: from here on every write is refused, so the
      // state the failed read left half-built never reaches the database.
      unavailable("absent", cause);
      track("schema_error", { code: "SCHEMA_MISMATCH:restore" });
      start();
    });
    return () => {
      live = false;
    };
  }, []);

  return ready;
}
