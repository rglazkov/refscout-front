"use client";

import * as React from "react";

import { online, subscribeToConnection } from "./connection";
import { subscribeToUpdates, updateWaiting } from "./register";

/** Whether the product can reach its server, as a screen can read it. */
export function useOnline(): boolean {
  return React.useSyncExternalStore(subscribeToConnection, online, () => true);
}

/** Whether a newer build is installed and waiting for this tab to let go. */
export function useUpdateWaiting(): boolean {
  return React.useSyncExternalStore(subscribeToUpdates, updateWaiting, () => false);
}
