"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";
import { TypeIcon, UploadIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { limits } from "@/lib/docs";

import { type RefusalNotice } from "./use-intake";

/**
 * The drop zone (M1.3.1). Inside it is a real `<input type="file" multiple>`
 * rather than a div with handlers, so Tab, Enter and the system dialogue all
 * work; react-dropzone supplies the drag handling around it.
 *
 * On a narrow screen the zone becomes two large buttons, because drag and drop
 * does not exist on a phone (§5).
 */
const ACCEPTED = ".txt,.md,.bib,.tex,.gls";

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
  /** Once the buffer has a document the zone shrinks in place; it never leaves (§4). */
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
          "flex flex-col items-center gap-3 rounded-xl border-[1.5px] border-dashed border-input bg-[image:var(--surface-dropzone)] text-center transition-[padding,border-color,background-color,box-shadow] duration-[var(--motion-slow)] ease-[var(--ease-out)]",
          compact ? "px-5 py-6" : "px-6 py-10",
          isDragActive &&
            "border-primary bg-primary-soft bg-none ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <input {...getInputProps()} accept={ACCEPTED} data-testid="file-input" />

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
          <Button
            type="button"
            variant="outline"
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

        <p className="font-mono text-xs text-muted-foreground">
          {t("limits", {
            maxSizeMb: Math.round(limits.maxFileBytes / (1024 * 1024)),
            maxDocuments: limits.maxDocuments,
          })}
        </p>
      </div>

      {refusals.length === 0 ? null : (
        <ul
          role="alert"
          data-testid="intake-refusals"
          className="mt-3 space-y-1 rounded-lg border border-critical-border bg-critical-soft p-3 text-sm text-critical"
        >
          {refusals.map((notice, index) => (
            <li key={`${notice.name}-${index}`}>
              <Refusal notice={notice} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A refusal names the numbers. "This file is too large" without them leaves the
 * person guessing which of their files it was and by how much (M1.3.5).
 */
function Refusal({ notice }: { readonly notice: RefusalNotice }) {
  const t = useTranslations("intake.refusal");
  const { refusal, name } = notice;

  switch (refusal.code) {
    case "FILE_TOO_LARGE":
      return (
        <>
          {t("fileTooLarge", {
            name,
            sizeMb: (refusal.size / (1024 * 1024)).toFixed(1),
            limitMb: Math.round(refusal.limit / (1024 * 1024)),
          })}
        </>
      );
    case "TOO_MANY_DOCUMENTS":
      return <>{t("tooMany", { count: refusal.count, limit: refusal.limit })}</>;
    case "DOC_TOO_LARGE":
      return (
        <>{t("docTooLarge", { name, chars: refusal.chars, limit: refusal.limit })}</>
      );
    case "JOB_TOO_LARGE":
      return <>{t("jobTooLarge", { chars: refusal.chars, limit: refusal.limit })}</>;
    default:
      return <>{t("unsupported", { name, extension: refusal.extension })}</>;
  }
}
