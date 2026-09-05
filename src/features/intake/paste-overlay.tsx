"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { BlockedButton } from "@/components/ui/blocked-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { CodeMirror } from "@/features/editor/code-mirror";
import { detectedSyntax, draftSyntaxKind, useSyntax } from "@/features/editor/syntax";
import { useVisualViewportFrame } from "@/features/editor/use-visual-viewport";
import { type IntakeDraft, type SourceFormat } from "@/lib/domain";
import { useIntakeDraftStore } from "@/stores";

/**
 * "Paste text". The same editor as the one documents are read in, only empty,
 * with a syntax switch above it. What is typed becomes an element of the buffer
 * exactly like a file: a name, a volume, checks, a way to remove it.
 *
 * Closing the overlay does not lose the draft. "Done" closes the overlay - it
 * does not confirm anything - and there is no "changed but not saved" state in
 * this product at all.
 *
 * A bibliography is not one of the syntaxes offered. It is not a document of
 * the buffer but what BibCheck on a document reads, and it is pasted into the
 * slot on that document's card instead.
 */
const SYNTAXES: readonly IntakeDraft["syntax"][] = ["auto", "latex", "markdown", "text"];

const FORMAT_OF: Readonly<Record<IntakeDraft["syntax"], SourceFormat>> = {
  auto: "typed",
  latex: "tex",
  markdown: "md",
  text: "txt",
};

/**
 * What the text becomes when it joins the buffer. A person who chose a syntax
 * has answered; on "auto" the text answers for itself, and it has to answer
 * here rather than later - the format is what the document is highlighted as,
 * proposed checks from, and handed back as.
 */
const FORMAT_OF_DETECTED: Readonly<Record<string, SourceFormat>> = {
  bibtex: "bib",
  latex: "tex",
  markdown: "md",
};

function formatOfDraft(draft: IntakeDraft): SourceFormat {
  if (draft.syntax !== "auto") return FORMAT_OF[draft.syntax];
  const detected = detectedSyntax(draft.text);
  return detected === null ? "txt" : (FORMAT_OF_DETECTED[detected] ?? "txt");
}

export function PasteOverlay({
  open,
  onClose,
  onAdd,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAdd: (text: string, name: string, format: SourceFormat) => void;
}) {
  const t = useTranslations("intake.paste");
  const draft = useIntakeDraftStore((state) => state.draft);
  const setText = useIntakeDraftStore((state) => state.setText);
  const setSyntax = useIntakeDraftStore((state) => state.setSyntax);
  const clear = useIntakeDraftStore((state) => state.clear);
  const frame = useVisualViewportFrame();
  // The switch above the field is not decoration: the text is shown as what it
  // is while it is being written, the same way a document of the buffer is
  // shown as what it is when it is opened.
  const language = useSyntax(draftSyntaxKind(draft.text, draft.syntax));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        /*
         * On a phone the overlay is the whole screen, sized and placed against
         * the visible part of it so the keyboard neither covers the field nor
         * pushes the top of the overlay down towards itself. On anything wider
         * it leaves only 0.5rem above and below, maximising the text that stays
         * visible while retaining the overlay's established width.
         */
        style={frame}
        className="flex h-[var(--overlay-height)] max-w-none flex-col gap-3 rounded-none p-4 sm:h-[calc(var(--overlay-height)-1rem)] sm:max-w-3xl sm:rounded-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
        </DialogHeader>

        {/* One question with four answers, so it is one control: a track with
            the chosen syntax sitting on it. Four buttons standing apart read as
            four things to do rather than as four positions of a switch. */}
        <Segmented
          className="self-start"
          label={t("syntaxLabel")}
          value={draft.syntax}
          onChange={setSyntax}
          options={SYNTAXES.map((syntax) => ({
            value: syntax,
            label: t(`syntax.${syntax}`),
          }))}
        />

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          <CodeMirror
            value={draft.text}
            onChange={setText}
            language={language}
            ariaLabel={t("fieldLabel")}
            className="h-full overflow-auto"
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t("close")}
          </Button>
          {draft.text.trim() === "" ? (
            <BlockedButton action="intake.add" reason={t("nothingTyped")} size="sm">
              {t("add")}
            </BlockedButton>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onAdd(draft.text, t("defaultName"), formatOfDraft(draft));
                clear();
                onClose();
              }}
            >
              {t("add")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
