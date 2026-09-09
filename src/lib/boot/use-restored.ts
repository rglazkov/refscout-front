"use client";

import * as React from "react";

import { claimWriteRole } from "@/lib/tabs";

import { restoreSession } from "./restore";
import { watchState } from "./subscribe";

/**
 * Whether the previous session has been read back yet.
 *
 * The screen waits for it. Drawing an empty buffer first and filling it a
 * moment later would show somebody that their documents are gone and then take
 * it back, and the read is one pass over a database on the same machine.
 */
export function useRestoredSession(): boolean {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void restoreSession().then(() => {
      if (!live) return;
      // The listeners are attached after the read, not before: attaching them
      // first would make the restoration itself look like a change and write
      // everything straight back down again.
      watchState();
      claimWriteRole();
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  return ready;
}
