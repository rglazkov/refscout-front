"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { BlockedButton } from "@/components/ui/blocked-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CodeMirror } from "@/features/editor/code-mirror";
import { useVisualViewportHeight } from "@/features/editor/use-visual-viewport";

/**
 * Text typed or pasted into one of the slots on a document's card - the
 * bibliography, the glossary file, the venue's requirements, the passage Cite
 * reads.
 *
 * It is the same editor a document is read in rather than a text area, and it
 * is the same size: what goes in here is a bibliography or a section of a
 * thesis, and a box three lines tall makes a person scroll a thousand entries
 * through a letterbox. The height comes from the visual viewport so the
 * keyboard on a phone cannot cover the button that accepts it.
 */
export function PasteInEditor({
  open,
  title,
  initial = "",
  confirmLabel,
  onClose,
  onDone,
}: {
  readonly open: boolean;
  readonly title: string;
  /** What is already in the slot, when this is opened to correct it. */
  readonly initial?: string;
  readonly confirmLabel: string;
  readonly onClose: () => void;
  readonly onDone: (text: string) => void | Promise<void>;
}) {
  const height = useVisualViewportHeight();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        style={{ "--overlay-height": height } as React.CSSProperties}
        className="flex h-[var(--overlay-height)] max-w-none flex-col gap-3 rounded-none p-4 sm:h-[calc(var(--overlay-height)-1rem)] sm:max-w-3xl sm:rounded-lg"
      >
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
        </DialogHeader>

        {/* Keyed on what the slot holds, and mounted only while the box is
            open: the box opens on the text that is in the slot now, without an
            effect copying one piece of state into another. */}
        <Body
          key={initial}
          title={title}
          initial={initial}
          confirmLabel={confirmLabel}
          onClose={onClose}
          onDone={onDone}
        />
      </DialogContent>
    </Dialog>
  );
}

function Body({
  title,
  initial,
  confirmLabel,
  onClose,
  onDone,
}: {
  readonly title: string;
  readonly initial: string;
  readonly confirmLabel: string;
  readonly onClose: () => void;
  readonly onDone: (text: string) => void | Promise<void>;
}) {
  const t = useTranslations("buffer.attach");
  const [text, setText] = React.useState(initial);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
        <CodeMirror
          value={text}
          onChange={setText}
          ariaLabel={title}
          className="h-full overflow-auto"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          {t("close")}
        </Button>
        {text.trim() === "" ? (
          <BlockedButton action="attach.paste" reason={t("nothingPasted")} size="sm">
            {confirmLabel}
          </BlockedButton>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void Promise.resolve(onDone(text)).then(() => onClose());
            }}
          >
            {confirmLabel}
          </Button>
        )}
      </div>
    </>
  );
}
