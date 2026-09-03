"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";
import { TypeIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { limits } from "@/lib/docs";

import { RefusalLine } from "./refusal-line";
import { type RefusalNotice } from "./use-intake";

/**
 * The drop zone. Inside it is a real `<input type="file" multiple>`, so the
 * system's own file dialogue is what opens and nothing is reimplemented;
 * react-dropzone supplies the drag handling around it.
 *
 * The field itself is not a control anybody reaches. It is rendered at zero
 * size and outside the tab order - that is what `getInputProps` produces, and
 * it is the right shape: the visible "Choose files" button is the control, it
 * is labelled, and it opens the dialogue by calling `open()`. So the field is
 * hidden from a screen reader as well, rather than sitting in the tree under
 * the label its library gives it, which is an English string in a product whose
 * every other word comes from the dictionary.
 *
 * On a narrow screen the zone becomes two large buttons, because drag and drop
 * does not exist on a phone.
 */
/** Every format the product reads. */
const ACCEPTED = ".pdf,.docx,.txt,.md,.tex,.bib,.gls";

export function DropZone({
  onFiles,
  onPaste,
  refusals,
  busy,
  compact,
}: {
  readonly onFiles: (files: readonly File[]) => void;
  readonly onPaste: () => void;
  readonly refusals: readonly RefusalNotice[];
  readonly busy: boolean;
  /**
   * Once the buffer has a document the zone shrinks in place; it never
   * leaves.
   */
  readonly compact: boolean;
}) {
  const t = useTranslations("workspace.dropzone");

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (accepted: File[]) => onFiles(accepted),
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        data-testid="drop-zone"
        data-drag-active={isDragActive}
        className={cn(
          "relative isolate flex flex-col items-center gap-3 overflow-hidden rounded-xl border-[1.5px] border-dashed border-input bg-[image:var(--surface-dropzone)] text-center transition-[padding,border-color,box-shadow] duration-[var(--motion-slow)] ease-[var(--ease-out)] before:absolute before:inset-0 before:-z-10 before:bg-primary-soft before:opacity-0 before:transition-opacity before:duration-[var(--motion-slow)] before:ease-[var(--ease-out)]",
          compact ? "px-5 py-6" : "px-6 py-10",
          // Fade a separate fill over the gradient. Swapping the background
          // image itself is discrete and makes the drag feedback jump.
          isDragActive && "border-primary before:opacity-100",
        )}
      >
        <input
          {...getInputProps()}
          accept={ACCEPTED}
          aria-hidden="true"
          aria-label={undefined}
          data-testid="file-input"
        />

        <span
          className={cn(
            "grid place-items-center rounded-full bg-primary-soft text-primary transition-[width,height] duration-[var(--motion-slow)] ease-[var(--ease-out)]",
            compact ? "size-9" : "size-11",
          )}
        >
          <UploadIcon className="size-5" aria-hidden="true" />
        </span>

        <h2 className="text-lg font-semibold">{compact ? t("titleMore") : t("title")}</h2>

        <div className="flex w-full flex-col items-center gap-2.5 nav:w-auto nav:flex-row nav:justify-center">
          <Button type="button" className="w-full nav:w-auto" onClick={open}>
            {busy ? t("reading") : t("choose")}
          </Button>
          {/* Inside the zone, beside "choose files": bringing a file, dropping
              one and typing the text in are three ways of doing the same thing,
              and the zone is where the screen says so. */}
          <Button
            type="button"
            variant="outlineOnCard"
            className="w-full nav:w-auto"
            onClick={onPaste}
          >
            <TypeIcon aria-hidden="true" />
            {t("paste")}
          </Button>
          <span className="hidden text-sm text-muted-foreground nav:inline">
            {t("orPaste")}{" "}
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {t("pasteShortcut")}
            </kbd>
          </span>
        </div>

        {/* Two lines and two roles, because the face follows the role of the
            text. The formats are values - a closed list of tokens, scanned
            rather than read - and they are monospaced. What follows is a
            sentence addressed to a person, so it is set in the ordinary face,
            and only the quantities inside it are monospaced: a whole sentence
            in the monospaced face reads as the output of a program rather than
            as something said to somebody. */}
        <div className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
          {/* Balanced, because on a phone the row wraps and an unbalanced break
              leaves the last format alone on a line of its own. */}
          <p className="font-mono tracking-wide text-balance">{t("formats")}</p>
          <p>
            {t.rich("limits", {
              maxSizeMb: Math.round(limits.maxFileBytes / (1024 * 1024)),
              maxDocuments: limits.maxDocuments,
              v: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
        </div>
      </div>

      {refusals.length === 0 ? null : (
        <ul
          role="alert"
          data-testid="intake-refusals"
          className="mt-3 space-y-1 rounded-lg border border-critical-border bg-critical-soft p-3 text-sm text-critical"
        >
          {refusals.map((notice, index) => (
            <li key={`${notice.name}-${index}`}>
              <RefusalLine notice={notice} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
