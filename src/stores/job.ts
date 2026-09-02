"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { type ModuleId, type RunIntent } from "@/lib/domain";

/**
 * The run: the intention behind it, the job it created, and the marks the
 * person puts on findings.
 *
 * The idempotency key lives here and nowhere else. Written inside the request
 * function, every retry would mint a new one - the protection would vanish
 * exactly where it exists to work. Written into a `useRef`, it would be
 * unmounted along with the component when the screen turns to progress.
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
   * travels to the server.
   */
  readonly fixed: Marks;
  /**
   * Findings the person has turned down, keyed the same way. It is the other
   * half of a pair: "fixed" says "I have dealt with this", "ignored" says "the
   * check is right and I do not want it". Two different sentences, so two
   * marks - and they exclude each other, because a finding cannot be both.
   */
  readonly ignored: Marks;
  /**
   * The sources accepted for a claim, keyed by document, finding and candidate.
   * It is the same kind of mark as `fixed`: a note the person makes while
   * reading, kept in the browser, and it never travels to the server. What it
   * is for is the bibliography assembled at the end of the Cite overlay.
   */
  readonly accepted: Marks;
  readonly beginIntent: (key: string, payloadHash: string) => RunIntent;
  readonly setInflight: (inflight: boolean) => void;
  readonly clearIntent: () => void;
  readonly setJob: (job: JobHandle) => void;
  readonly clearJob: () => void;
  readonly toggleFixed: (docId: string, module: ModuleId, issueId: string) => void;
  readonly toggleIgnored: (docId: string, module: ModuleId, issueId: string) => void;
  readonly toggleAccepted: (docId: string, issueId: string, candidateId: string) => void;
  readonly reset: () => void;
};

/**
 * A set of marks, written as a record rather than as an array or a `Set`. Every
 * row of a long list asks whether it is marked, and over an array that question
 * is a scan: on a dissertation's findings the screen then does the work of the
 * whole list once per row. A `Set` answers as fast and does not survive being
 * written to storage, which these marks have to do.
 */
export type Marks = Readonly<Record<string, true>>;

/** With the key removed rather than set to false: absent means unmarked. */
function toggle(marks: Record<string, true>, key: string): void {
  if (marks[key] === true) delete marks[key];
  else marks[key] = true;
}

export function fixedKey(docId: string, module: ModuleId, issueId: string): string {
  return `${docId}:${module}:${issueId}`;
}

/** Cite is the only module with candidates, so its name is not part of the key. */
export function acceptedKey(docId: string, issueId: string, candidateId: string): string {
  return `${docId}:${issueId}:${candidateId}`;
}

export const useJobStore = create<JobState>()(
  immer((set, get) => ({
    intent: null,
    job: null,
    fixed: {},
    ignored: {},
    accepted: {},

    /**
     * One key per press of the button. A press whose payload hash matches the
     * standing intention is the same intention and keeps its key; a different
     * hash is a different intention and must get a new one.
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
        toggle(state.fixed, key);
        // The other mark goes: a finding is either dealt with or turned down,
        // and a row wearing both marks says nothing.
        delete state.ignored[key];
      }),

    toggleIgnored: (docId, module, issueId) =>
      set((state) => {
        const key = fixedKey(docId, module, issueId);
        toggle(state.ignored, key);
        delete state.fixed[key];
      }),

    toggleAccepted: (docId, issueId, candidateId) =>
      set((state) => {
        toggle(state.accepted, acceptedKey(docId, issueId, candidateId));
      }),

    reset: () =>
      set((state) => {
        state.intent = null;
        state.job = null;
        state.fixed = {};
        state.ignored = {};
        state.accepted = {};
      }),
  })),
);
