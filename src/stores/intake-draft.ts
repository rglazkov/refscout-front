"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type IntakeDraft } from "@/lib/domain";

/**
 * The paste overlay's draft (§5, §18). Closing the overlay does not lose it:
 * "Done" closes the overlay, it does not confirm anything, and a draft that
 * disappears because a file was dropped is text the person cannot get back.
 */
export type IntakeDraftState = {
  readonly draft: IntakeDraft;
  readonly setText: (text: string) => void;
  readonly setSyntax: (syntax: IntakeDraft["syntax"]) => void;
  readonly clear: () => void;
};

const empty: IntakeDraft = { text: "", syntax: "auto" };

export const useIntakeDraftStore = create<IntakeDraftState>()(
  immer((set) => ({
    draft: empty,
    setText: (text) =>
      set((state) => {
        state.draft.text = text;
      }),
    setSyntax: (syntax) =>
      set((state) => {
        state.draft.syntax = syntax;
      }),
    clear: () =>
      set((state) => {
        state.draft = empty;
      }),
  })),
);
