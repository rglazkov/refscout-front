"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type ModuleId, type RunIntent } from "@/lib/domain";

/**
 * The run: the intention behind it, the job it created, and the marks the
 * person puts on findings (M1.8.1).
 *
 * The idempotency key lives here and nowhere else. Written inside the request
 * function, every retry would mint a new one - the protection would vanish
 * exactly where it exists to work. Written into a `useRef`, it would be
 * unmounted along with the component when the screen turns to progress (§17).
 */
export type JobHandle = {
  readonly jobId: string;
  readonly jobToken: string;
};

export type JobState = {
  readonly intent: RunIntent | null;
  readonly job: JobHandle | null;
  /**
   * Findings the person has dealt with, keyed by document, module and finding.
   * It only marks a finding as read; it never touches the text, and it never
   * travels to the server (§9, M1.9.4).
   */
  readonly fixed: readonly string[];
  readonly beginIntent: (key: string, payloadHash: string) => RunIntent;
  readonly setInflight: (inflight: boolean) => void;
  readonly clearIntent: () => void;
  readonly setJob: (job: JobHandle) => void;
  readonly clearJob: () => void;
  readonly toggleFixed: (docId: string, module: ModuleId, issueId: string) => void;
  readonly reset: () => void;
};

export function fixedKey(docId: string, module: ModuleId, issueId: string): string {
  return `${docId}:${module}:${issueId}`;
}

export const useJobStore = create<JobState>()(
  immer((set, get) => ({
    intent: null,
    job: null,
    fixed: [],

    /**
     * One key per press of the button. A press whose payload hash matches the
     * standing intention is the same intention and keeps its key; a different
     * hash is a different intention and must get a new one (§17).
     */
    beginIntent: (key, payloadHash) => {
      const standing = get().intent;
      if (standing !== null && standing.payloadHash === payloadHash) {
        set((state) => {
          if (state.intent !== null) state.intent.inflight = true;
        });
        return { ...standing, inflight: true };
      }
      const intent: RunIntent = { key, payloadHash, inflight: true };
      set((state) => {
        state.intent = intent;
      });
      return intent;
    },

    setInflight: (inflight) =>
      set((state) => {
        if (state.intent !== null) state.intent.inflight = inflight;
      }),

    /** Only a created job clears the intention: until then we do not know it arrived. */
    clearIntent: () =>
      set((state) => {
        state.intent = null;
      }),

    setJob: (job) =>
      set((state) => {
        state.job = job;
      }),

    clearJob: () =>
      set((state) => {
        state.job = null;
      }),

    toggleFixed: (docId, module, issueId) =>
      set((state) => {
        const key = fixedKey(docId, module, issueId);
        state.fixed = state.fixed.includes(key)
          ? state.fixed.filter((mark) => mark !== key)
          : [...state.fixed, key];
      }),

    reset: () =>
      set((state) => {
        state.intent = null;
        state.job = null;
        state.fixed = [];
      }),
  })),
);
