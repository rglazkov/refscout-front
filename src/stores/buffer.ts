"use client";

import { castDraft } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  type BufferItem,
  type ExtractInfo,
  type ModuleId,
  type VenueRef,
  moduleIds,
} from "@/lib/domain";
import { roleFromChecks } from "@/lib/docs";

/**
 * The descriptions of the documents in the buffer (M1.2.1). There is no text
 * here and there never will be: once text is in a store it is in the serialised
 * state and in the error report as well (§17).
 *
 * The store is not persisted. In this milestone the buffer lives for as long as
 * the tab does, the interface says so, and IndexedDB arrives in M4 - which is
 * why the registry behind the text has an adapter seam and this store has a
 * flat, serialisable shape.
 */
export type BufferState = {
  readonly items: readonly BufferItem[];
  readonly add: (item: BufferItem) => void;
  readonly remove: (docId: string) => void;
  readonly clear: () => void;
  /** A tick the person made themselves. It sets `checksTouched` (M1.4.3). */
  readonly toggleCheck: (docId: string, module: ModuleId, checked: boolean) => void;
  /**
   * The automatic proposal. It passes over documents where the person has
   * touched the ticks - the automation suggests, and never overrules (§4).
   */
  readonly propose: (docId: string, checks: readonly ModuleId[]) => void;
  readonly setVenue: (docId: string, venue: VenueRef | undefined) => void;
  readonly patchExtract: (docId: string, patch: Partial<ExtractInfo>) => void;
};

export const useBufferStore = create<BufferState>()(
  immer((set) => ({
    items: [],

    add: (item) =>
      set((state) => {
        state.items.push(castDraft(item));
      }),

    remove: (docId) =>
      set((state) => {
        state.items = state.items.filter((item) => item.id !== docId);
      }),

    clear: () =>
      set((state) => {
        state.items = [];
      }),

    toggleCheck: (docId, module, checked) =>
      set((state) => {
        const item = state.items.find((candidate) => candidate.id === docId);
        if (item === undefined) return;
        const checks = new Set(item.checks);
        if (checked) checks.add(module);
        else checks.delete(module);
        item.checks = castDraft(moduleIds.filter((id) => checks.has(id)));
        item.checksTouched = true;
        item.role = roleFromChecks(item.checks, {
          isVenueRequirements: item.venue?.kind === "file",
        });
      }),

    propose: (docId, checks) =>
      set((state) => {
        const item = state.items.find((candidate) => candidate.id === docId);
        if (item === undefined || item.checksTouched) return;
        item.checks = castDraft(moduleIds.filter((id) => checks.includes(id)));
        item.role = roleFromChecks(item.checks);
      }),

    setVenue: (docId, venue) =>
      set((state) => {
        const item = state.items.find((candidate) => candidate.id === docId);
        if (item === undefined) return;
        item.venue = castDraft(venue);
      }),

    patchExtract: (docId, patch) =>
      set((state) => {
        const item = state.items.find((candidate) => candidate.id === docId);
        if (item === undefined) return;
        item.extract = castDraft({ ...item.extract, ...patch });
      }),
  })),
);

/** Documents with text: the only ones a check can be run on (§4, M1.6.2). */
export function readableItems(items: readonly BufferItem[]): readonly BufferItem[] {
  return items.filter(
    (item) => item.extract.state === "ready" || item.extract.state === "partial",
  );
}

/** What will actually be sent: readable, and with at least one check ticked (§4). */
export function submittableItems(items: readonly BufferItem[]): readonly BufferItem[] {
  return readableItems(items).filter((item) => item.checks.length > 0);
}

export function totalChars(items: readonly BufferItem[]): number {
  return items.reduce((sum, item) => sum + item.extract.chars, 0);
}
