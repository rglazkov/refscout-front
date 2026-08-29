"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { BlockedButton } from "@/components/ui/blocked-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CodeMirror } from "@/features/editor/code-mirror";
import { useVisualViewportHeight } from "@/features/editor/use-visual-viewport";
import { type IntakeDraft, type SourceFormat } from "@/lib/domain";
import { useIntakeDraftStore } from "@/stores";

/**
 * "Paste text" (§5). The same editor as the one documents are read in, only
 * empty, with a syntax switch above it. What is typed becomes an element of the
 * buffer exactly like a file: a name, a volume, checks, a way to remove it.
 *
 * Closing the overlay does not lose the draft. "Done" closes the overlay - it
 * does not confirm anything - and there is no "changed but not saved" state in
 * this product at all (§4).
 */
const SYNTAXES: readonly IntakeDraft["syntax"][] = [
  "auto",
  "latex",
  "bibtex",
  "markdown",
  "text",
];

const FORMAT_OF: Readonly<Record<IntakeDraft["syntax"], SourceFormat>> = {
  auto: "typed",
  latex: "tex",
  bibtex: "bib",
  markdown: "md",
  text: "txt",
};

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
  const height = useVisualViewportHeight();

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        style={{ height }}
        className="flex max-w-none flex-col gap-3 rounded-none p-4 sm:max-w-3xl sm:rounded-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
          <DialogDescription className="text-xs">{t("lead")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {SYNTAXES.map((syntax) => (
            <Button
              key={syntax}
              type="button"
              size="xs"
              variant={draft.syntax === syntax ? "default" : "outline"}
              onClick={() => setSyntax(syntax)}
            >
              {t(`syntax.${syntax}`)}
            </Button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          <CodeMirror
            value={draft.text}
            onChange={setText}
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
                onAdd(draft.text, t("defaultName"), FORMAT_OF[draft.syntax]);
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
