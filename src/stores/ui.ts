"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type ModuleId } from "@/lib/domain";

import { type Marks } from "./job";

/**
 * What the working area is showing. Two of the tools do not start from a
 * document in the buffer - one takes a query, the other a pair of versions - so
 * each is a mode of this one screen rather than a page of its own. The buffer is
 * untouched by the switch: a mode changes what the area holds and never what is
 * in it.
 */
export type WorkspaceMode = "buffer" | "scout" | "diff";

/** Which text the overlay is showing, and whether it can be edited. */
export type OverlayTarget = {
  readonly docId: string;
  readonly mode: "edit" | "read";
};

/**
 * What is open and what is folded. It belongs to the browser rather than to the
 * server, so it lives in Zustand and not in Query.
 */
export type UiState = {
  readonly mode: WorkspaceMode;
  readonly overlay: OverlayTarget | null;
  /** Last target stays mounted while Radix plays the overlay's exit motion. */
  readonly retainedOverlay: OverlayTarget | null;
  readonly paywallModule: ModuleId | null;
  readonly docListCollapsed: boolean;
  /**
   * The check cards that have been opened on the results screen, by document,
   * and the findings opened inside them. Records rather than arrays: every row
   * of a long list asks whether it is open, and over an array that question is
   * a scan.
   */
  readonly openCards: Marks;
  readonly openIssues: Marks;
  readonly setMode: (mode: WorkspaceMode) => void;
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
    mode: "buffer",
    overlay: null,
    retainedOverlay: null,
    paywallModule: null,
    docListCollapsed: false,
    openCards: {},
    openIssues: {},

    setMode: (mode) =>
      set((state) => {
        state.mode = mode;
      }),
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
        if (state.openCards[key] === true) delete state.openCards[key];
        else state.openCards[key] = true;
      }),
    toggleIssue: (key) =>
      set((state) => {
        if (state.openIssues[key] === true) delete state.openIssues[key];
        else state.openIssues[key] = true;
      }),
  })),
);
