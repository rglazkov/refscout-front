"use client";

import * as React from "react";
import { DownloadIcon } from "lucide-react";
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
  downloadExtensionOf,
  proposeChecks,
  replaceText,
  sha256Hex,
} from "@/lib/docs";
import { downloadDocumentText } from "@/lib/export";
import { useBufferStore, useUiStore } from "@/stores";

import { CodeMirror } from "./code-mirror";
import { syntaxKindOf, useSyntax } from "./syntax";
import { useVisualViewportHeight } from "./use-visual-viewport";

/**
 * The text of a document, over the page. A click on the name opens it; the page
 * underneath stays where it is, because rebuilding the buffer and the plan
 * behind the overlay would throw away the scroll position and every card the
 * person had opened.
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

  // Asked for by what the document is, and fetched while the overlay opens. The
  // hook is called before the early return below, because a hook is.
  const language = useSyntax(
    item === undefined ? null : syntaxKindOf(item.sourceFormat, item.detected),
  );

  const content = docRegistry.get(docId);
  const initial = content?.text ?? "";
  const [chars, setChars] = React.useState(() => countCodePoints(initial));
  const pending = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * The edit is applied to the buffer itself, not to a copy made for viewing:
   * what leaves for the server is this text. There is no "changed but not
   * saved" state in the product - "Done" closes the overlay, it does not
   * confirm anything.
   */
  const onChange = React.useCallback(
    (next: string) => {
      const stored = replaceText(docId, next);
      if (stored === undefined) return;
      setChars(countCodePoints(next));

      // The proposal, the volume and the plan summary are recomputed after the
      // typing stops rather than on every keystroke.
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        void sha256Hex(next).then((sha256) => {
          patchExtract(docId, {
            chars: countCodePoints(next),
            words: countWords(next),
            /*
             * Against the hash taken when the text was read, not against what
             * the field held a moment ago: the registry is written on every
             * keystroke, so anything derived from its current contents compares
             * this keystroke with the last one and says "edited" for a document
             * that has been typed into and put back exactly as it was. Undo
             * gives back the same bytes and therefore the same hash.
             */
            edited: sha256 !== stored.originalSha256,
            sha256,
            state: next.trim() === "" ? "empty" : "ready",
          });
        });
        if (item !== undefined) {
          propose(docId, proposeChecks(next, item.sourceFormat));
        }
      }, RECOMPUTE_DELAY_MS);
    },
    [docId, item, patchExtract, propose],
  );

  React.useEffect(
    () => () => {
      if (pending.current !== null) clearTimeout(pending.current);
    },
    [],
  );

  if (item === undefined) return null;

  const extension = downloadExtensionOf(item.sourceFormat);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        /*
         * On a phone the overlay is the whole screen, with a way back, and its
         * height comes from the visual viewport rather than from the window:
         * otherwise the keyboard covers the button that closes it. On anything
         * wider it leaves only 0.5rem above and below, maximising the text that
         * stays visible while retaining the editor's established width. The
         * height travels as a custom property because an inline `height` could
         * not then be narrowed by a breakpoint.
         *
         * The side margins are halved on a phone. There is no page behind the
         * overlay to separate the field from - it is the whole screen - and the
         * width the margins take is width the line does not get, which on a
         * manuscript is the difference between a line that wraps and one that
         * does not.
         */
        style={{ "--overlay-height": height } as React.CSSProperties}
        className="flex h-[var(--overlay-height)] max-w-none flex-col gap-3 rounded-none px-2 py-4 sm:h-[calc(var(--overlay-height)-1rem)] sm:max-w-4xl sm:rounded-lg sm:px-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate font-mono text-base">
              {item.name}
            </DialogTitle>
            {/* The measurement is monospaced and the sentence is not: the rule
                is that a quantity or an identifier is set in the mono face, not
                that everything small is. */}
            <DialogDescription
              className={mode === "read" ? "text-xs" : "font-mono text-xs"}
            >
              {mode === "read"
                ? t("readOnlyReason")
                : t("volume", { chars, words: item.extract.words })}
            </DialogDescription>
          </div>
          {/* The text is downloaded from the place the person is reading it, in
              the format it was brought in - `.txt` while the browser cannot yet
              build that format. This is the bridge between one check and the
              next: correct the text here, save the file, drop it into a new
              check. */}
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="download-document"
              onClick={() => downloadDocumentText(docId, item.name, extension)}
            >
              <DownloadIcon aria-hidden="true" />
              {t("download", { extension })}
            </Button>
            {/* The one action that closes the overlay, so it is the primary
                button - the same weight as Download report on the results,
                which is the other place a screen has a single obvious way
                onward. */}
            <Button type="button" size="sm" onClick={onClose}>
              {t("done")}
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          <CodeMirror
            value={initial}
            language={language}
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
