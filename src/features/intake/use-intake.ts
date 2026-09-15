"use client";

import * as React from "react";

import {
  docRegistry,
  extensionOf,
  formatOf,
  holdSourceFile,
  refuseByCount,
  refuseBySize,
  sanitizeDocumentName,
  sourceFileOf,
  type IntakeRefusal,
} from "@/lib/docs";
import { type BufferItem, type FilledSlot, type SourceFormat } from "@/lib/domain";
import { newId } from "@/lib/webcrypto";
import { type ParseProgress } from "@/workers";
import { totalChars, useBufferStore } from "@/stores";

import {
  acceptArtifact,
  acceptAttachmentFile,
  acceptAttachmentText,
  acceptFile,
  acceptText,
  artifactId,
  placeholderFor,
  type ExtractOptions,
} from "./intake";

/**
 * The seam between intake and the buffer. Intake itself knows nothing about the
 * buffer; this hook is the caller that puts what intake produced where it
 * belongs - the description into the store, the text into the registry.
 *
 * It also owns the waiting. A document appears in the buffer the moment it is
 * dropped, in the state "reading", and the parse fills it in underneath: a
 * three-hundred-page PDF takes seconds, and those seconds belong on the card of
 * the document they are being spent on, with a button that stops them.
 */
export type RefusalNotice = { readonly name: string; readonly refusal: IntakeRefusal };

/**
 * What a check on this document already reads: the document itself and every
 * text hanging off it. The ceiling of a check is over the composition, so the
 * composition is what a new one is measured against.
 */
function checkCharsOf(docId: string): number {
  const { items } = useBufferStore.getState();
  return items
    .filter((item) => item.id === docId || item.attachedTo?.docId === docId)
    .reduce((sum, item) => sum + item.extract.chars, 0);
}

/**
 * What one of the slots on a document's card got back. The refusal is handed to
 * the caller rather than kept here, because it belongs beside the control that
 * was used and not in the drop zone at the top of the page.
 */
export type AttachResult =
  | { readonly ok: true; readonly item: BufferItem }
  | { readonly ok: false; readonly notice: RefusalNotice };

export type IntakeApi = {
  readonly refusals: readonly RefusalNotice[];
  readonly busy: boolean;
  /** How far the parse of each document being read has got. */
  readonly progress: Readonly<Record<string, ParseProgress>>;
  addFiles: (files: readonly File[]) => Promise<void>;
  addText: (text: string, name: string, format: SourceFormat) => Promise<string | null>;
  /** Reads the file behind a document again - after a failure, or with a password. */
  reread: (docId: string, options?: ExtractOptions) => Promise<void>;
  /** The same document, read from a file chosen again after the first one went. */
  chooseAgain: (docId: string, file: File) => Promise<void>;
  cancel: (docId: string) => void;
  attachFile: (docId: string, slot: FilledSlot, file: File) => Promise<AttachResult>;
  attachText: (
    docId: string,
    slot: FilledSlot,
    text: string,
    name: string,
    format?: SourceFormat,
  ) => Promise<AttachResult>;
  adoptArtifact: (input: {
    readonly docId: string;
    readonly module: string;
    readonly name: string;
    readonly format: SourceFormat;
    readonly text: string;
  }) => Promise<string>;
  dismissRefusals: () => void;
};

export function useIntake(): IntakeApi {
  const [refusals, setRefusals] = React.useState<readonly RefusalNotice[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<Record<string, ParseProgress>>({});
  // Outside React state: the controller is read by the parse that is already
  // running, and a render is not what makes cancelling work.
  const running = React.useRef(new Map<string, AbortController>());

  const clearProgress = React.useCallback((docId: string) => {
    running.current.delete(docId);
    setProgress((current) => {
      const { [docId]: _gone, ...rest } = current;
      return rest;
    });
  }, []);

  /**
   * Reads one file into the document that is already on screen. Everything that
   * can be said before the text exists - the name, the size, the format - is on
   * the card already; this replaces the card with the finished document, or
   * with the same card carrying the reason it could not be read.
   */
  const readInto = React.useCallback(
    async (docId: string, file: File, options: ExtractOptions = {}) => {
      const existing = running.current.get(docId);
      const controller =
        existing && !existing.signal.aborted ? existing : new AbortController();
      running.current.set(docId, controller);
      setProgress((current) => ({ ...current, [docId]: { done: 0, total: 0 } }));
      useBufferStore.getState().patchExtract(docId, {
        state: "extracting",
        errorCode: undefined,
        errorParams: undefined,
      });

      try {
        const result = await acceptFile(
          file,
          { bufferChars: totalChars(useBufferStore.getState().items) },
          {
            ...options,
            signal: controller.signal,
            onProgress: (next) =>
              setProgress((current) => ({ ...current, [docId]: next })),
          },
          docId,
        );

        if (!useBufferStore.getState().items.some((item) => item.id === docId)) {
          return;
        }

        if (!result.ok) {
          // A refusal of intake is not a state of a document: it never becomes
          // one, so the card that was standing in for it goes with it - and
          // with the card goes the handle to the file, which was taken before
          // the parse and is refused only after it. Removal is one operation
          // for exactly this reason: this path never had to remember.
          useBufferStore.getState().remove(docId);
          setRefusals((current) => [
            ...current,
            { name: result.name, refusal: result.refusal },
          ]);
          return;
        }

        docRegistry.put(docId, result.content);
        useBufferStore.getState().replace(docId, result.item);
      } finally {
        clearProgress(docId);
      }
    },
    [clearProgress],
  );

  const addFiles = React.useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      setRefusals([]);
      try {
        const { items } = useBufferStore.getState();
        // Counted over every text held in the browser. What hangs off a
        // document is not a row in the list, but it takes the same room: a
        // manuscript brought with its bibliography and its glossary file is
        // three.
        const tooMany = refuseByCount(items.length, files.length);
        if (tooMany !== null) {
          setRefusals([{ name: "", refusal: tooMany }]);
          return;
        }

        const validFiles: File[] = [];
        const immediateRefusals: RefusalNotice[] = [];

        for (const file of files) {
          const name = sanitizeDocumentName(file.name);
          const tooBig = refuseBySize(file.size);
          if (tooBig !== null) {
            immediateRefusals.push({ name, refusal: tooBig });
            continue;
          }
          const format = formatOf(file.name);
          if (format === null) {
            immediateRefusals.push({
              name,
              refusal: { code: "UNSUPPORTED_FORMAT", extension: extensionOf(file.name) },
            });
            continue;
          }
          validFiles.push(file);
        }

        if (immediateRefusals.length > 0) {
          setRefusals((current) => [...current, ...immediateRefusals]);
        }

        // All valid documents appear in the buffer immediately upon drop.
        const queue = validFiles.map((file) => {
          const placeholder = placeholderFor(file);
          const controller = new AbortController();
          running.current.set(placeholder.id, controller);
          holdSourceFile(placeholder.id, file);
          return { file, placeholder, controller };
        });

        for (const entry of queue) {
          useBufferStore.getState().add(entry.placeholder);
        }

        // Sequential on purpose: the whole-buffer limit is counted against the
        // buffer as it stands, and a parallel loop would race that number.
        for (const entry of queue) {
          const currentItem = useBufferStore
            .getState()
            .items.find((item) => item.id === entry.placeholder.id);
          if (
            !currentItem ||
            currentItem.extract.state === "failed" ||
            entry.controller.signal.aborted
          ) {
            continue;
          }
          await readInto(entry.placeholder.id, entry.file);
        }
      } finally {
        setBusy(false);
      }
    },
    [readInto],
  );

  const addText = React.useCallback(
    async (text: string, name: string, format: SourceFormat) => {
      setBusy(true);
      setRefusals([]);
      try {
        const result = await acceptText(text, name, format, {
          bufferChars: totalChars(useBufferStore.getState().items),
        });
        if (!result.ok) {
          setRefusals([{ name: result.name, refusal: result.refusal }]);
          return null;
        }
        docRegistry.put(result.item.id, result.content);
        useBufferStore.getState().add(result.item);
        return result.item.id;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /**
   * The two ways out that need the file a second time: "Try again" after a
   * failure that may not repeat, and the password of a protected PDF. The file
   * is a handle to the person's own disk, so a document that has since been
   * moved fails here with the row of the table that says exactly that.
   */
  const reread = React.useCallback(
    async (docId: string, options: ExtractOptions = {}) => {
      const file = sourceFileOf(docId);
      if (file === undefined) {
        useBufferStore
          .getState()
          .patchExtract(docId, { state: "failed", errorCode: "FILE_UNREADABLE" });
        return;
      }
      await readInto(docId, file, options);
    },
    [readInto],
  );

  const chooseAgain = React.useCallback(
    async (docId: string, file: File) => {
      holdSourceFile(docId, file);
      await readInto(docId, file);
    },
    [readInto],
  );

  const cancel = React.useCallback(
    (docId: string) => {
      running.current.get(docId)?.abort();
      const item = useBufferStore
        .getState()
        .items.find((candidate) => candidate.id === docId);
      if (item && item.extract.state === "reading") {
        useBufferStore.getState().patchExtract(docId, {
          state: "failed",
          errorCode: "CANCELLED",
        });
        clearProgress(docId);
      }
    },
    [clearProgress],
  );

  /**
   * A file brought in for one of the slots on a document's card. It is read in
   * the browser exactly like every other text and never leaves it; it goes into
   * the store marked as hanging off that document, so the job can name it by id
   * while the buffer list stays a list of documents.
   */
  const attachFile = React.useCallback(
    async (docId: string, slot: FilledSlot, file: File): Promise<AttachResult> => {
      const full = refuseByCount(useBufferStore.getState().items.length, 1);
      if (full !== null) return { ok: false, notice: { name: file.name, refusal: full } };
      const result = await acceptAttachmentFile(file, slot, checkCharsOf(docId));
      if (!result.ok) {
        return { ok: false, notice: { name: result.name, refusal: result.refusal } };
      }
      docRegistry.put(result.item.id, result.content);
      useBufferStore.getState().attach(docId, slot, result.item);
      return { ok: true, item: result.item };
    },
    [],
  );

  /** The same slot, filled by pasting the text instead of bringing the file. */
  const attachText = React.useCallback(
    async (
      docId: string,
      slot: FilledSlot,
      text: string,
      name: string,
      format: SourceFormat = "typed",
    ): Promise<AttachResult> => {
      const full = refuseByCount(useBufferStore.getState().items.length, 1);
      if (full !== null) return { ok: false, notice: { name, refusal: full } };
      const result = await acceptAttachmentText(
        text,
        name,
        slot,
        format,
        checkCharsOf(docId),
      );
      if (!result.ok) {
        return { ok: false, notice: { name: result.name, refusal: result.refusal } };
      }
      docRegistry.put(result.item.id, result.content);
      useBufferStore.getState().attach(docId, slot, result.item);
      return { ok: true, item: result.item };
    },
    [],
  );

  /**
   * The file a finished check wrote, taken into the browser as a text of its
   * own so it can be read, corrected and downloaded in the editor - which is
   * the one place a document is downloaded from.
   *
   * Adopting it twice is adopting it once: the identity is derived from the
   * document and the module, so a second press opens the text that is already
   * there, edits and all.
   */
  const adoptArtifact = React.useCallback(
    async (input: {
      readonly docId: string;
      readonly module: string;
      readonly name: string;
      readonly format: SourceFormat;
      readonly text: string;
    }) => {
      const id = artifactId(input.docId, input.module);
      const known = useBufferStore
        .getState()
        .items.some((candidate) => candidate.id === id);
      // The same file twice is the same text: a check's artifact does not
      // change, so pressing again opens the one that is already here, edits and
      // all. A file the browser assembled from a changing selection does
      // change, and then the earlier one is left alone and a new text is made -
      // overwriting it would throw away whatever was corrected in it.
      if (known && docRegistry.get(id)?.text === input.text) return id;
      const { item, content } = await acceptArtifact(input);
      const fresh = known ? { ...item, id: newId() } : item;
      docRegistry.put(fresh.id, content);
      useBufferStore.getState().add(fresh);
      return fresh.id;
    },
    [],
  );

  const dismissRefusals = React.useCallback(() => setRefusals([]), []);

  return {
    refusals,
    busy,
    progress,
    addFiles,
    addText,
    reread,
    chooseAgain,
    cancel,
    attachFile,
    attachText,
    adoptArtifact,
    dismissRefusals,
  };
}
