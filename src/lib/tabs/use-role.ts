"use client";

import * as React from "react";

import { subscribeToRole, tabRole, writeRefused, type TabRole } from "./writer";

/** Which tab this one is, as a screen can read it. */
export function useTabRole(): TabRole {
  return React.useSyncExternalStore(subscribeToRole, tabRole, writerOnServer);
}

/**
 * Whether a write was refused because the role had already gone. It is a
 * different sentence from merely waiting: something the person had typed did
 * not reach the database, and saying nothing about it would be the silent loss
 * the whole handover protocol exists to prevent.
 */
export function useWriteRefused(): boolean {
  return React.useSyncExternalStore(subscribeToRole, writeRefused, () => false);
}

/** A static build has one tab and no locks; the verdict arrives in the browser. */
function writerOnServer(): TabRole {
  return "writer";
}
