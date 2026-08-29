"use client";

import * as React from "react";

import { docRegistry, refuseByCount, type IntakeRefusal } from "@/lib/docs";
import { type SourceFormat } from "@/lib/domain";
import { totalChars, useBufferStore } from "@/stores";

import { acceptFile, acceptText } from "./intake";

/**
 * The seam between intake and the buffer. Intake itself knows nothing about the
 * buffer (M1.3.2); this hook is the caller that puts what intake produced where
 * it belongs - the description into the store, the text into the registry.
 */
export type RefusalNotice = { readonly name: string; readonly refusal: IntakeRefusal };

export type AddedRequirements = {
  readonly docId: string;
  readonly name: string;
  readonly text: string;
};

export function useIntake(): {
  readonly refusals: readonly RefusalNotice[];
  readonly busy: boolean;
  addFiles: (files: readonly File[]) => Promise<void>;
  addRequirementsFile: (file: File) => Promise<AddedRequirements | null>;
  addText: (text: string, name: string, format: SourceFormat) => Promise<string | null>;
  dismissRefusals: () => void;
} {
  const [refusals, setRefusals] = React.useState<readonly RefusalNotice[]>([]);
  const [busy, setBusy] = React.useState(false);

  const addFiles = React.useCallback(async (files: readonly File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setRefusals([]);
    try {
      const { items } = useBufferStore.getState();
      const tooMany = refuseByCount(items.length, files.length);
      if (tooMany !== null) {
        setRefusals([{ name: "", refusal: tooMany }]);
        return;
      }

      const rejected: RefusalNotice[] = [];
      for (const file of files) {
        // Sequential on purpose: the whole-buffer limit is counted against the
        // buffer as it stands, and a parallel loop would race that number.
        const result = await acceptFile(file, {
          bufferChars: totalChars(useBufferStore.getState().items),
        });
        if (!result.ok) {
          rejected.push({ name: result.name, refusal: result.refusal });
          continue;
        }
        docRegistry.put(result.item.id, result.content);
        useBufferStore.getState().add(result.item);
      }
      setRefusals(rejected);
    } finally {
      setBusy(false);
    }
  }, []);

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
   * A requirements file. It is read in the browser exactly like every other
   * document and never leaves it; it enters the buffer with no checks ticked,
   * so the job can name it by id and the plan says why it takes no part (§4).
   */
  const addRequirementsFile = React.useCallback(async (file: File) => {
    const result = await acceptFile(file, {
      bufferChars: totalChars(useBufferStore.getState().items),
    });
    if (!result.ok) {
      setRefusals([{ name: result.name, refusal: result.refusal }]);
      return null;
    }
    const requirements = {
      ...result.item,
      checks: [],
      checksTouched: true,
      role: "venue-requirements" as const,
    };
    docRegistry.put(requirements.id, result.content);
    useBufferStore.getState().add(requirements);
    return { docId: requirements.id, name: requirements.name, text: result.content.text };
  }, []);

  const dismissRefusals = React.useCallback(() => setRefusals([]), []);

  return { refusals, busy, addFiles, addRequirementsFile, addText, dismissRefusals };
}
