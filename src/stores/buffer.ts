"use client";

import { castDraft } from "immer";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import {
  type AttachmentSlot,
  type BufferItem,
  type CheckOptions,
  type ExtractInfo,
  type FilledSlot,
  type ModuleId,
  type VenueRef,
  moduleIds,
} from "@/lib/domain";
import { clearAllDocuments, forgetDocument, roleFromChecks, selfKind } from "@/lib/docs";

/**
 * The descriptions of the documents in the buffer. There is no text here and
 * there never will be: once text is in a store it is in the serialised state
 * and in the error report as well.
 *
 * The store is not persisted. For now the buffer lives for as long as the tab
 * does and the interface says so; IndexedDB is what it is meant to live in,
 * which is why the registry behind the text has an adapter seam and this store
 * has a flat, serialisable shape.
 */
export type BufferState = {
  readonly items: readonly BufferItem[];
  readonly add: (item: BufferItem) => void;
  /**
   * Removes a document whole: the card, the text behind it and the handle to
   * the file it was read from all go in one call. A caller that had to remember
   * to forget the text separately is a caller that forgets it, and what is left
   * behind is then a copy of somebody's manuscript that no card can reach.
   */
  readonly remove: (docId: string) => void;
  /** The same, over everything at once. */
  readonly clear: () => void;
  /** A tick the person made themselves. It sets `checksTouched`. */
  readonly toggleCheck: (docId: string, module: ModuleId, checked: boolean) => void;
  /**
   * The automatic proposal. It passes over documents where the person has
   * touched the ticks - the automation suggests, and never overrules.
   */
  readonly propose: (docId: string, checks: readonly ModuleId[]) => void;
  readonly setVenue: (docId: string, venue: VenueRef | undefined) => void;
  /**
   * Names a document of the buffer as the text one of this document's checks
   * reads. It is the same link as a slot fills, made the other way: the
   * companion was brought in through the drop zone as a document in its own
   * right, so it keeps its card, its ticks and its place in the list, and this
   * only records that a check here reads it.
   */
  readonly chooseCompanion: (
    docId: string,
    slot: FilledSlot,
    companionId: string | undefined,
  ) => void;
  /**
   * A text brought in for one of the slots on a document's card: the
   * bibliography BibCheck reads, the glossary file Glossary reads, the venue's
   * requirements, or the file a finished check wrote. It goes into the store as
   * an element like any other - so that it opens in the editor, travels with
   * the job and is downloaded from the editor - and it is marked as hanging off
   * its document, which keeps it out of the list and out of the counts.
   */
  readonly attach: (docId: string, slot: AttachmentSlot, item: BufferItem) => void;
  /**
   * Empties one slot and destroys the text in it. The check goes on running
   * with the part it can do alone, and the plan on the card says which part
   * that is.
   */
  readonly detach: (docId: string, slot: AttachmentSlot) => void;
  /** The settings of one module, on one document. */
  readonly setOptions: <K extends keyof CheckOptions>(
    docId: string,
    module: K,
    patch: Partial<CheckOptions[K]>,
  ) => void;
  readonly patchExtract: (docId: string, patch: Partial<ExtractInfo>) => void;
  /**
   * The finished document in place of the card that stood there while it was
   * being read. It is a replacement rather than a patch because extraction
   * settles nearly everything at once - the checks, the role, what the content
   * turned out to be - and it keeps the document where it is in the list, which
   * is where the person is looking.
   */
  readonly replace: (docId: string, item: BufferItem) => void;
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
        // What hung off the document goes with it. A bibliography whose
        // manuscript has gone belongs to nothing, and no card is left from
        // which it could be removed later.
        const attached = state.items.filter((item) => item.attachedTo?.docId === docId);
        const gone = new Set([docId, ...attached.map((item) => item.id)]);
        for (const id of gone) forgetDocument(id);
        state.items = state.items.filter((item) => !gone.has(item.id));
        // A companion that has been removed is not a companion. Left in place
        // it would name a document the job does not carry, and the check would
        // silently do less than the card promised.
        for (const item of state.items) {
          for (const moduleId of moduleIds) {
            const companion = item.companions[moduleId];
            if (companion !== undefined && gone.has(companion)) {
              delete item.companions[moduleId];
            }
          }
          if (item.venue?.docId !== undefined && gone.has(item.venue.docId)) {
            item.venue = undefined;
          }
        }
      }),

    clear: () =>
      set((state) => {
        clearAllDocuments();
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
        item.role = roleOf(item);
      }),

    propose: (docId, checks) =>
      set((state) => {
        const item = state.items.find((candidate) => candidate.id === docId);
        if (item === undefined || item.checksTouched) return;
        item.checks = castDraft(moduleIds.filter((id) => checks.includes(id)));
        item.role = roleOf(item);
      }),

    setVenue: (docId, venue) =>
      set((state) => {
        const item = state.items.find((candidate) => candidate.id === docId);
        if (item === undefined) return;
        item.venue = castDraft(venue);
      }),

    attach: (docId, slot, attachment) =>
      set((state) => {
        const host = state.items.find((candidate) => candidate.id === docId);
        if (host === undefined) return;
        // One text per slot: bringing a second bibliography replaces the first
        // rather than leaving two, neither of which the card could name.
        dropSlot(state, docId, slot);
        state.items.push(castDraft({ ...attachment, attachedTo: { docId, slot } }));

        if (slot === "bibcheck" || slot === "glossary") {
          host.companions[slot] = attachment.id;
          host.role = roleOf(host);
        }
      }),

    chooseCompanion: (docId, slot, companionId) =>
      set((state) => {
        const host = state.items.find((candidate) => candidate.id === docId);
        if (host === undefined) return;
        // One text per slot, whichever way it arrived: naming a document of the
        // buffer replaces whatever was brought in through the slot, and that
        // text is destroyed with it. The document named instead is not touched -
        // it is somebody's document and it stays in the list.
        dropSlot(state, docId, slot);
        if (slot === "venue") {
          const named = state.items.find((candidate) => candidate.id === companionId);
          host.venue =
            named === undefined
              ? undefined
              : castDraft({
                  kind: "file" as const,
                  source: named.name,
                  docId: named.id,
                  state: "ready" as const,
                });
          return;
        }
        if (companionId === undefined) delete host.companions[slot];
        else host.companions[slot] = companionId;
        host.role = roleOf(host);
      }),

    detach: (docId, slot) =>
      set((state) => {
        dropSlot(state, docId, slot);
        const host = state.items.find((candidate) => candidate.id === docId);
        if (host === undefined) return;
        if (slot === "bibcheck" || slot === "glossary") {
          delete host.companions[slot];
          host.role = roleOf(host);
        }
        if (slot === "venue") host.venue = undefined;
      }),

    setOptions: (docId, module, patch) =>
      set((state) => {
        const item = state.items.find((candidate) => candidate.id === docId);
        if (item === undefined) return;
        // Assigned onto the draft rather than replaced: a fresh object here
        // has to be narrowed back to the module the key names, and immer's
        // draft type cannot follow that through a generic key.
        Object.assign(item.options[module], patch);
      }),

    replace: (docId, item) =>
      set((state) => {
        const at = state.items.findIndex((candidate) => candidate.id === docId);
        if (at === -1) return;
        state.items[at] = castDraft(item);
      }),

    patchExtract: (docId, patch) =>
      set((state) => {
        const item = state.items.find((candidate) => candidate.id === docId);
        if (item === undefined) return;
        item.extract = castDraft({ ...item.extract, ...patch });
      }),
  })),
);

/**
 * The role of a document as it now stands: what it is in its own right, what is
 * ticked on it, and whether a check on it reads a second text. It is recomputed
 * rather than patched, because all three of those change.
 */
function roleOf(item: BufferItem): BufferItem["role"] {
  return roleFromChecks(item.checks, {
    ...(item.attachedTo === undefined ? {} : { slot: item.attachedTo.slot }),
    self: selfKind(item.sourceFormat, item.detected),
    hasCompanions: Object.keys(item.companions).length > 0,
  });
}

/**
 * Empties one slot: a text brought in through it leaves the registry and the
 * store, and a document of the buffer named in it is only unnamed. Attaching
 * uses it too, because bringing a second bibliography replaces the first rather
 * than leaving two, neither of which the card could name.
 */
function dropSlot(
  state: { items: BufferItem[] },
  docId: string,
  slot: AttachmentSlot,
): void {
  const matches = (item: BufferItem): boolean =>
    item.attachedTo?.docId === docId && item.attachedTo.slot === slot;
  for (const previous of state.items.filter(matches)) forgetDocument(previous.id);
  state.items = state.items.filter((item) => !matches(item));
}

/**
 * The documents of the buffer. Attachments live in the same array - they are
 * texts like any other and the job carries them - but they are not documents of
 * the buffer: they do not appear in the list, they are not counted, and they
 * are removed from the card they hang off.
 */
export function mainItems(items: readonly BufferItem[]): readonly BufferItem[] {
  return items.filter((item) => item.attachedTo === undefined);
}

/** What fills one slot on one document, if anything does. */
export function attachmentOf(
  items: readonly BufferItem[],
  docId: string,
  slot: AttachmentSlot,
): BufferItem | undefined {
  return items.find(
    (item) => item.attachedTo?.docId === docId && item.attachedTo.slot === slot,
  );
}

/**
 * The text one of a document's checks reads, whichever of the two ways it got
 * there: brought in through the slot on this card, or named from the buffer.
 * The link itself is the same either way - the id in `companions`, or in the
 * venue - so it is read from there and not from which way it arrived.
 */
export function companionOf(
  items: readonly BufferItem[],
  host: BufferItem,
  slot: FilledSlot,
): BufferItem | undefined {
  const id = slot === "venue" ? host.venue?.docId : host.companions[slot];
  return id === undefined ? undefined : items.find((candidate) => candidate.id === id);
}

/**
 * The documents this one's checks could read: every other document of the
 * buffer that has text. A text brought in through a slot is not among them - it
 * already belongs to the card it hangs off.
 */
export function companionChoices(
  items: readonly BufferItem[],
  host: BufferItem,
): readonly BufferItem[] {
  return mainItems(readableItems(items)).filter((item) => item.id !== host.id);
}

/** Documents with text: the only ones a check can be run on. */
export function readableItems(items: readonly BufferItem[]): readonly BufferItem[] {
  return items.filter(
    (item) =>
      item.extract.state === "ready" ||
      item.extract.state === "partial" ||
      // Badly extracted text is still text, and the person decides whether it
      // is good enough after reading it - we do not decide for them.
      item.extract.state === "suspicious",
  );
}

export function totalChars(items: readonly BufferItem[]): number {
  return items.reduce((sum, item) => sum + item.extract.chars, 0);
}
