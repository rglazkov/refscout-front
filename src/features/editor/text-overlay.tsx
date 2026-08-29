"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  docRegistry,
  countCodePoints,
  countWords,
  proposeChecks,
  replaceText,
} from "@/lib/docs";
import { useBufferStore, useUiStore } from "@/stores";

import { CodeMirror } from "./code-mirror";
import { useVisualViewportHeight } from "./use-visual-viewport";

/**
 * The text of a document, over the page (M1.5.1). A click on the name opens it;
 * the page underneath stays where it is, because rebuilding the buffer and the
 * plan behind the overlay would throw away the scroll position and every card
 * the person had opened.
 *
 * Modality by the rules: the focus is locked inside, Esc closes, and afterwards
 * the focus returns to the control the overlay was opened from. All three come
 * from the dialogue primitive rather than from a hand-rolled trap.
 */
const RECOMPUTE_DELAY_MS = 400;

export function TextOverlay() {
  const overlay = useUiStore((state) => state.overlay);
  const retained = useUiStore((state) => state.retainedOverlay);
  const closeOverlay = useUiStore((state) => state.closeOverlay);

  const shown = overlay ?? retained;
  if (shown === null) return null;
  return (
    <OverlayBody
      key={shown.docId}
      open={overlay !== null}
      docId={shown.docId}
      mode={shown.mode}
      onClose={closeOverlay}
    />
  );
}

function OverlayBody({
  open,
  docId,
  mode,
  onClose,
}: {
  readonly open: boolean;
  readonly docId: string;
  readonly mode: "edit" | "read";
  readonly onClose: () => void;
}) {
  const t = useTranslations("editor");
  const item = useBufferStore((state) => state.items.find((entry) => entry.id === docId));
  const patchExtract = useBufferStore((state) => state.patchExtract);
  const propose = useBufferStore((state) => state.propose);
  const height = useVisualViewportHeight();

  const content = docRegistry.get(docId);
  const initial = content?.text ?? "";
  const [chars, setChars] = React.useState(() => countCodePoints(initial));
  const pending = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The edit is applied to the buffer itself, not to a copy made for viewing:
   * what leaves for the server is this text. There is no "changed but not
   * saved" state in the product - "Done" closes the overlay, it does not
   * confirm anything (M1.5.4).
   */
  const onChange = React.useCallback(
    (next: string) => {
      const stored = replaceText(docId, next);
      if (stored === undefined) return;
      setChars(countCodePoints(next));

      // The proposal, the volume and the plan summary are recomputed after the
      // typing stops rather than on every keystroke (M1.5.5).
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        patchExtract(docId, {
          chars: countCodePoints(next),
          words: countWords(next),
          edited: next !== initial || stored.originalSha256 === undefined,
          state: next.trim() === "" ? "empty" : "ready",
        });
        if (item !== undefined) {
          propose(docId, proposeChecks(next, item.sourceFormat));
        }
      }, RECOMPUTE_DELAY_MS);
    },
    [docId, initial, item, patchExtract, propose],
  );

  React.useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    [],
  );

  if (item === undefined) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        // On a phone the overlay is the whole screen with a way back, and its
        // height comes from the visual viewport rather than from the window:
        // otherwise the keyboard covers the button that closes it (M1.5.6).
        style={{ height }}
        className="flex max-w-none flex-col gap-3 rounded-none p-4 sm:max-w-4xl sm:rounded-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base">{item.name}</DialogTitle>
            <DialogDescription className="text-xs">
              {mode === "read"
                ? t("readOnlyReason")
                : t("volume", { chars, words: item.extract.words })}
            </DialogDescription>
          </div>
          {/* The one action of this overlay, so it is the primary button -
              the same weight as Download on the results, which is the other
              place a screen has a single obvious way onward (§14). */}
          <Button type="button" size="sm" onClick={onClose}>
            {t("done")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          <CodeMirror
            value={initial}
            readOnly={mode === "read"}
            onChange={mode === "read" ? undefined : onChange}
            ariaLabel={t("fieldLabel", { name: item.name })}
            className="h-full overflow-auto"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
