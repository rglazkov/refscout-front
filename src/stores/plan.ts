"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type CheckOptions } from "@/lib/domain";

/**
 * The module settings (M1.6.4). Every field the current product has is kept -
 * they simply stop being the first thing a person sees, and live in the
 * "configure" disclosure instead (§7).
 *
 * The venue is not here. It belongs to the document, because a buffer with two
 * manuscripts for two journals is an ordinary buffer (§4, §18).
 */
export const defaultOptions: CheckOptions = {
  bibcheck: {
    verifyLive: true,
    showOrphans: true,
    unifyKeys: false,
    keyFormat: "author-year",
    sortBy: "author",
    countCommented: false,
  },
  glossary: {},
  presubmit: { anonymity: true },
  cite: { maxPerClaim: 3 },
};

export type PlanState = {
  readonly options: CheckOptions;
  readonly setBibcheck: (patch: Partial<CheckOptions["bibcheck"]>) => void;
  readonly setGlossary: (patch: Partial<CheckOptions["glossary"]>) => void;
  readonly setPresubmit: (patch: Partial<CheckOptions["presubmit"]>) => void;
  readonly setCite: (patch: Partial<CheckOptions["cite"]>) => void;
  readonly reset: () => void;
};

export const usePlanStore = create<PlanState>()(
  immer((set) => ({
    options: defaultOptions,

    setBibcheck: (patch) =>
      set((state) => {
        state.options.bibcheck = { ...state.options.bibcheck, ...patch };
      }),
    setGlossary: (patch) =>
      set((state) => {
        state.options.glossary = { ...state.options.glossary, ...patch };
      }),
    setPresubmit: (patch) =>
      set((state) => {
        state.options.presubmit = { ...state.options.presubmit, ...patch };
      }),
    setCite: (patch) =>
      set((state) => {
        state.options.cite = { ...state.options.cite, ...patch };
      }),
    reset: () =>
      set((state) => {
        state.options = defaultOptions;
      }),
  })),
);
