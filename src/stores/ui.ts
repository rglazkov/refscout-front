"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type ModuleId } from "@/lib/domain";

/** Which text the overlay is showing, and whether it can be edited (M1.5, M1.9.7). */
export type OverlayTarget = {
  readonly docId: string;
  readonly mode: "edit" | "read";
};

/**
 * What is open and what is folded. It belongs to the browser rather than to the
 * server, so it lives in Zustand and not in Query (M1.2.3).
 */
export type UiState = {
  readonly overlay: OverlayTarget | null;
  /** Last target stays mounted while Radix plays the overlay's exit motion. */
  readonly retainedOverlay: OverlayTarget | null;
  readonly paywallModule: ModuleId | null;
  readonly docListCollapsed: boolean;
  /** The check cards that have been opened on the results screen, by document. */
  readonly openCards: readonly string[];
  readonly openIssues: readonly string[];
  readonly openOverlay: (target: OverlayTarget) => void;
  readonly closeOverlay: () => void;
  readonly openPaywall: (module: ModuleId) => void;
  readonly closePaywall: () => void;
  readonly setDocListCollapsed: (collapsed: boolean) => void;
  readonly toggleCard: (docId: string, module: ModuleId) => void;
  readonly toggleIssue: (key: string) => void;
};

export const useUiStore = create<UiState>()(
  immer((set) => ({
    overlay: null,
    retainedOverlay: null,
    paywallModule: null,
    docListCollapsed: false,
    openCards: [],
    openIssues: [],

    openOverlay: (target) =>
      set((state) => {
        state.overlay = target;
        state.retainedOverlay = target;
      }),
    closeOverlay: () =>
      set((state) => {
        state.overlay = null;
      }),
    openPaywall: (module) =>
      set((state) => {
        state.paywallModule = module;
      }),
    closePaywall: () =>
      set((state) => {
        state.paywallModule = null;
      }),
    setDocListCollapsed: (collapsed) =>
      set((state) => {
        state.docListCollapsed = collapsed;
      }),
    toggleCard: (docId, module) =>
      set((state) => {
        const key = `${docId}:${module}`;
        state.openCards = state.openCards.includes(key)
          ? state.openCards.filter((open) => open !== key)
          : [...state.openCards, key];
      }),
    toggleIssue: (key) =>
      set((state) => {
        state.openIssues = state.openIssues.includes(key)
          ? state.openIssues.filter((open) => open !== key)
          : [...state.openIssues, key];
      }),
  })),
);
