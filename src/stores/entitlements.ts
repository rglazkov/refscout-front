"use client";

import { create } from "zustand";

import { type Entitlements } from "@/lib/domain";

/**
 * A mirror of the server's answer, never a source of truth (§13). Days of
 * access are spent by the server; nothing is counted down here, and this store
 * is not persisted at all - a stale copy of "access is open" is worse than no
 * copy.
 *
 * Nothing reads it yet: the locks are M5, and the store exists now so that the
 * shape does not have to be invented at the same time as the paywall.
 */
export type EntitlementsState = {
  readonly entitlements: Entitlements | null;
  readonly set: (entitlements: Entitlements) => void;
  readonly clear: () => void;
};

export const useEntitlementsStore = create<EntitlementsState>()((set) => ({
  entitlements: null,
  set: (entitlements) => set({ entitlements }),
  clear: () => set({ entitlements: null }),
}));
