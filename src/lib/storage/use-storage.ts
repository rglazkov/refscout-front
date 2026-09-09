"use client";

import * as React from "react";

import { storageMode, subscribeToStorage, type StorageMode } from "./mode";

/**
 * Whether what the person is doing will outlive the tab, as a screen can read
 * it. It lives beside the storage rather than in a feature because three
 * different screens ask the same question - the buffer, the editor and the
 * results - and a copy of the subscription in each is a copy that gets out of
 * step with the others.
 */
export function useStorageMode(): StorageMode {
  return React.useSyncExternalStore(subscribeToStorage, storageMode, durableOnServer);
}

/**
 * What the server renders. Nothing is stored during a static build and there is
 * no browser to refuse anything, so the honest answer is the one that draws no
 * warning: the real verdict arrives on the first paint in the browser.
 */
function durableOnServer(): StorageMode {
  return { durable: true, fault: null, discarded: false };
}
