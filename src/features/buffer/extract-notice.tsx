"use client";

import * as React from "react";
import { KeyIcon, RotateCcwIcon, TypeIcon, UploadIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { site } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { type BufferItem, type ExtractFailureCode } from "@/lib/domain";
import { type ParseProgress } from "@/workers";

/**
 * What a document that would not read says on its own card, and what a person
 * can do about it there.
 *
 * Three rules hold for every row of the table, and they are the reason this is
 * a part of the card rather than a message that appears and goes:
 *
 *  - the reason lives on the card, for as long as the problem does, so that in
 *    a buffer of five documents it is obvious which one is the problem;
 *  - every failure has a way out that can be taken here, without leaving the
 *    page - a password, another attempt, another file, the text typed in;
 *  - one broken document does not stop the others: the plan is recalculated
 *    without it and says so, which happens on the plan and not here.
 */
export type ExtractNoticeProps = {
  readonly item: BufferItem;
  readonly progress?: ParseProgress;
  readonly onRetry: () => void;
  readonly onUnlock: (password: string) => void;
  readonly onChooseAgain: (file: File) => void;
  readonly onCancel: () => void;
  readonly onOpenText: () => void;
};

/** Whether a state has anything to say here at all. */
export function needsNotice(item: BufferItem): boolean {
  return item.extract.state !== "ready";
}

/**
 * The parse, said out loud. A progress bar is something to look at, and a
 * hundred-page PDF takes seconds during which somebody who cannot see it has no
 * way to know whether anything is happening or whether it has finished.
 *
 * It lives on the card rather than inside the notice because the notice is
 * gone by the time there is an ending to announce: a document that read
 * cleanly has nothing to show, and a live region that unmounts says nothing.
 *
 * Silent where the visible line is already `role="alert"`. Two regions over one
 * event is the same sentence twice, and the second one arrives as an
 * interruption.
 */
export function ExtractAnnouncement({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.extract.announce");
  const format = useFormatter();
  const state = item.extract.state;

  const said =
    state === "reading" || state === "extracting"
      ? t("reading", { name: item.name })
      : state === "needs-password"
        ? t("password", { name: item.name })
        : state === "failed" || state === "empty"
          ? ""
          : t("read", { name: item.name, chars: format.number(item.extract.chars) });

  return (
    <p aria-live="polite" className="sr-only" data-testid="extract-announcement">
      {said}
    </p>
  );
}

export function ExtractNotice(props: ExtractNoticeProps) {
  const { item } = props;
  const t = useTranslations("buffer.extract");
  const state = item.extract.state;

  if (state === "reading" || state === "extracting") {
    return <Reading {...props} />;
  }

  const code = item.extract.errorCode;
  const critical = state === "failed" || state === "empty";
  return (
    <div
      data-testid="extract-notice"
      data-extract-state={state}
      data-extract-code={code}
      className={cn(
        "rounded-lg border p-2.5",
        critical
          ? "border-critical-border bg-critical-soft"
          : "border-warning-border bg-warning-soft",
      )}
    >
      <p
        role={critical ? "alert" : undefined}
        className={cn("text-sm", critical ? "text-critical" : "text-warning")}
      >
        <Reason item={item} />
      </p>
      <MissingPages item={item} />
      {state === "needs-password" ? (
        <Password {...props} />
      ) : (
        <Ways {...props} code={code} />
      )}
      {state === "needs-password" ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{t("password.hint")}</p>
      ) : null}
    </div>
  );
}

/**
 * The sentence, with its numbers in it. A refusal without them leaves a person
 * guessing which ceiling they met and by how much.
 */
function Reason({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.extract.reason");
  const format = useFormatter();
  const code = item.extract.errorCode;
  if (code === undefined) return null;

  const numbers = Object.fromEntries(
    Object.entries(item.extract.errorParams ?? {}).map(([key, value]) => [
      key,
      format.number(value),
    ]),
  );

  return (
    <>
      {t(code, {
        ...numbers,
        // The product's name comes from the brand file like everywhere else:
        // renaming it is one edit, not a hundred.
        brandName: site.name,
        pages: format.number(item.extract.pages ?? 0),
        parsed: format.number(item.extract.pagesParsed ?? 0),
      })}
    </>
  );
}

/**
 * Which pages are missing, listed rather than counted: "47 of 60" says how much
 * is gone, and this says whether the part that is gone is the part that matters.
 */
function MissingPages({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.extract");
  const missing = item.extract.missingPages;
  if (missing === undefined || missing.length === 0) return null;
  return (
    <p className="mt-1 font-mono text-xs text-muted-foreground">
      {t("missingPages", { pages: missing.join(", ") })}
    </p>
  );
}

/**
 * Reading, with the fraction done and a button that stops it. The person does
 * not care whose processor is busy; they care that the application has not
 * frozen and that they can change their mind.
 */
function Reading({
  item,
  progress,
  onCancel,
}: Pick<ExtractNoticeProps, "item" | "progress" | "onCancel">) {
  const t = useTranslations("buffer.extract");
  const share =
    progress === undefined || progress.total === 0
      ? null
      : Math.min(1, progress.done / progress.total);

  return (
    <div data-testid="extract-progress" data-extract-state={item.extract.state}>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground">
          {share === null
            ? t("progressWorking")
            : t("progressPages", {
                done: progress?.done ?? 0,
                total: progress?.total ?? 0,
              })}
        </span>
        <Button
          type="button"
          variant="outlineOnCard"
          size="xs"
          data-testid="cancel-extract"
          onClick={onCancel}
        >
          {t("stop")}
        </Button>
      </div>
      {/* Indeterminate until the parser can say how much is left: a bar that
          invents a number is worse than one that admits it does not know. */}
      <div
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={t("extracting")}
        {...(share === null
          ? {}
          : {
              "aria-valuenow": Math.round(share * 100),
              "aria-valuemin": 0,
              "aria-valuemax": 100,
            })}
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out)]",
            share === null && "w-1/3 animate-pulse",
          )}
          {...(share === null ? {} : { style: { width: `${share * 100}%` } })}
        />
      </div>
    </div>
  );
}

/**
 * The password of a protected PDF, typed on the card. It lives in the memory of
 * this tab until the parse ends and is sent nowhere - there is nowhere to send
 * it, because the parsing happens here.
 */
function Password({ item, onUnlock }: Pick<ExtractNoticeProps, "item" | "onUnlock">) {
  const t = useTranslations("buffer.extract");
  const [password, setPassword] = React.useState("");

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (password !== "") onUnlock(password);
      }}
    >
      {/* The ring is on the box rather than on the field, because the field is
          only part of it: the key stands inside the same border, and an outline
          drawn around the input alone would ring half of what the eye sees as
          the control. Same tokens and same width as every other field, so a
          keyboard reaches this one and sees what it reached. */}
      <span className="inline-flex h-8 max-w-52 items-center gap-1.5 rounded-md border bg-control-card px-2 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <KeyIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="password"
          value={password}
          data-testid="pdf-password"
          aria-label={t("password.label", { name: item.name })}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          onChange={(event) => setPassword(event.target.value)}
        />
      </span>
      <Button type="submit" size="sm" data-testid="unlock-pdf">
        {t("password.unlock")}
      </Button>
    </form>
  );
}

/**
 * The ways out, chosen by what went wrong. "Try again" is offered where another
 * attempt could plausibly differ; a different file where the one we hold has
 * gone; and the text typed in by hand everywhere, because it is the way out
 * that always works and is the reason editing before the run exists at all.
 */
/**
 * The three states where the text is there and only wants looking at. The
 * button says "Open and correct" rather than "Type the text in": there is
 * something to correct, and telling a person to retype a document we managed to
 * read would be an insult.
 */
const NEEDS_CORRECTING = new Set<ExtractFailureCode | undefined>([
  "TEXT_SUSPICIOUS",
  "TEXT_BAD_ENCODING",
  "PAGES_MISSING",
]);

function Ways({
  code,
  onRetry,
  onChooseAgain,
  onOpenText,
}: Pick<ExtractNoticeProps, "onRetry" | "onChooseAgain" | "onOpenText"> & {
  readonly code: ExtractFailureCode | undefined;
}) {
  const t = useTranslations("buffer.extract.way");
  const input = React.useRef<HTMLInputElement | null>(null);
  const retryable =
    code === "FILE_UNREADABLE" ||
    code === "PDF_CORRUPT" ||
    code === "WORKER_TIMEOUT" ||
    code === "WORKER_CRASHED" ||
    code === "CANCELLED";

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {retryable ? (
        <Button
          type="button"
          variant="outlineOnCard"
          size="xs"
          data-testid="retry-extract"
          onClick={onRetry}
        >
          <RotateCcwIcon aria-hidden="true" />
          {t("retry")}
        </Button>
      ) : null}

      {code === "FILE_UNREADABLE" ? (
        <>
          <Button
            type="button"
            variant="outlineOnCard"
            size="xs"
            data-testid="choose-again"
            onClick={() => input.current?.click()}
          >
            <UploadIcon aria-hidden="true" />
            {t("chooseAgain")}
          </Button>
          {/* The real control is the button above; this exists only so that
              pressing it opens the system dialogue. It is hidden from the
              keyboard and from a screen reader, which already have the
              button. */}
          <input
            ref={input}
            type="file"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) onChooseAgain(file);
            }}
          />
        </>
      ) : null}

      <Button
        type="button"
        variant="outlineOnCard"
        size="xs"
        data-testid="type-text-in"
        onClick={onOpenText}
      >
        <TypeIcon aria-hidden="true" />
        {t(NEEDS_CORRECTING.has(code) ? "open" : "type")}
      </Button>
    </div>
  );
}
