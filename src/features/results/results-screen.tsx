"use client";

import * as React from "react";
import { PencilIcon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";

import { DocumentIcon } from "@/components/document-icon";
import { Collapse } from "@/components/motion/collapse";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import {
  type Counts,
  type Job,
  type JobDocument,
  type ModuleId,
  moduleIds,
  resultKey,
} from "@/lib/domain";
import { documentCounts, jobCounts } from "@/lib/normalize";
import { useBufferStore, useUiStore } from "@/stores";

import { CheckCard } from "./check-card";
import { DownloadReportButton } from "./download-report";

/**
 * The results. Three levels and no extra screen: a document, then the cards of
 * its checks, then the findings inside a card. The top level is the document,
 * because a person works with a manuscript rather than with a module, and "what
 * is wrong with this file" gets a direct answer.
 *
 * No job is created from this screen - not by any path. The invariant is worded
 * that way rather than as "no text is sent", because a test is written from
 * this wording and it stays true when a single failed module is re-run inside
 * the job that already exists.
 */
export function ResultsScreen({
  job,
  running,
  onNewCheck,
  onRetryModule,
}: {
  readonly job: Job;
  readonly running: boolean;
  readonly onNewCheck: () => void;
  readonly onRetryModule: (docId: string, module: ModuleId) => void;
}) {
  const t = useTranslations("results");
  const format = useFormatter();
  const now = useNow();
  const [confirming, setConfirming] = React.useState(false);

  const totals = jobCounts(job);
  // A text a check read without being run on it - a bibliography, a glossary
  // file, the venue's requirements - is in the job and has no results of its
  // own. It is not a row here: the results are about what was checked.
  const documents = orderByReadiness(job.status.documents).filter((document) =>
    running ? hasVisibleResult(document) : hasAnyModule(document),
  );
  const notRun = job.status.documents.reduce(
    (total, document) => total + notRunCount(document),
    0,
  );
  const checkedAt = latestFinishedAt(job.status.documents) ?? job.status.createdAt;

  if (running && documents.length === 0) return null;

  return (
    <section
      // While the run is on, the results sit under the progress card and are
      // spaced from it. Once it is over the card is gone and this is the top of
      // the screen, where a margin of its own only adds to the one the screen
      // already has.
      className={running ? "mt-5" : undefined}
      aria-labelledby={running ? "ready-results-heading" : "results-heading"}
    >
      {running ? (
        <p
          id="ready-results-heading"
          className="mb-3 text-xs font-semibold tracking-wide uppercase"
        >
          {t("readyNow")}
        </p>
      ) : null}

      <Collapse open={!running}>
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="results-heading"
                className="text-[1.375rem] font-semibold tracking-[-0.01em]"
              >
                {t("heading")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("documentsChecked", {
                  documents: job.status.documents.length,
                  when: format.relativeTime(new Date(checkedAt), now),
                })}
              </p>
            </div>
            <div className="flex gap-2">
              <DownloadReportButton job={job} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setConfirming(true)}
              >
                <UploadIcon aria-hidden="true" />
                {t("newCheck")}
              </Button>
            </div>
          </div>

          <div
            className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3.5 py-2.5"
            data-testid="results-totals"
          >
            <span className="text-xs font-semibold tracking-wide uppercase">
              {t("acrossDocuments")}
            </span>
            <ProblemCounts counts={totals} notRun={notRun} />
            <span className="min-w-4 flex-1" aria-hidden="true" />
            <span className="text-[0.8125rem] text-muted-foreground">
              {t("scoresNotAveraged")}
            </span>
          </div>

          <p className="mt-3 flex items-start gap-2 text-[0.8125rem] text-muted-foreground">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t("finishedNote")}</span>
          </p>

          {/* It destroys the documents, the edits and everything stored, and
              there is nowhere to get them back from. So it asks before the
              clearing rather than reporting the loss after it, and it asks in a
              dialogue: a strip at the end of the page is answerable by
              scrolling past it. The report is offered inside the question,
              where it is still worth taking. */}
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={t("newCheckTitle")}
            body={t("newCheckConfirm")}
            confirmLabel={t("newCheckYes")}
            cancelLabel={t("cancel")}
            testId="new-check-confirm"
            // Full width beside the answers when they stack, so that the three
            // read as three answers and not as two and an afterthought.
            extra={
              <DownloadReportButton
                job={job}
                variant="outline"
                className="w-full sm:w-auto"
              />
            }
            onConfirm={onNewCheck}
          />
        </div>
      </Collapse>

      <div key="document-list" className={running ? "space-y-6" : "mt-4 space-y-6"}>
        {documents.map((document) => (
          <DocumentResults
            key={document.docId}
            job={job}
            document={document}
            onRetryModule={onRetryModule}
          />
        ))}
      </div>
    </section>
  );
}

function DocumentResults({
  job,
  document,
  onRetryModule,
}: {
  readonly job: Job;
  readonly document: JobDocument;
  readonly onRetryModule: (docId: string, module: ModuleId) => void;
}) {
  const t = useTranslations("results");
  const bufferT = useTranslations("buffer");
  const format = useFormatter();
  const openOverlay = useUiStore((state) => state.openOverlay);
  const item = useBufferStore((state) =>
    state.items.find((candidate) => candidate.id === document.docId),
  );
  const nameRef = React.useRef<HTMLSpanElement>(null);
  const counts = documentCounts(document.modules);
  const notRun = notRunCount(document);
  const openDocument = React.useCallback(
    () => openOverlay({ docId: document.docId, mode: "edit" }),
    [document.docId, openOverlay],
  );

  React.useEffect(() => {
    const name = nameRef.current;
    if (name === null) return;
    const handlePointerClick = () => {
      if (window.getSelection()?.isCollapsed === false) return;
      openDocument();
    };
    name.addEventListener("click", handlePointerClick);
    return () => name.removeEventListener("click", handlePointerClick);
  }, [openDocument]);

  /*
   * The text was corrected after the job carrying it left. Editing here is the
   * point - the corrected file is what Download gives back - but the findings
   * below were written against the text as it was sent, and their line numbers
   * and quotes now point at a document that has moved under them. Recomputing
   * the places is not built yet; saying so is what the screen owes the reader,
   * because a coordinate that is quietly wrong looks exactly like one that is
   * right.
   */
  const movedUnderFindings =
    item !== undefined && item.extract.sha256 !== document.textSha256;

  const volume =
    item !== undefined &&
    (item.extract.state === "ready" || item.extract.state === "partial")
      ? bufferT("volume", {
          words: format.number(item.extract.words),
          chars: format.number(item.extract.chars),
        })
      : t("characters", { chars: format.number(document.cpLength) });

  /*
   * The result opens the same live document the buffer used, and edits apply at
   * once to the text Download returns. Written once and placed twice: on a wide
   * screen it belongs at the end of the heading, and on anything narrower there
   * is no room for it there, so it becomes a row of its own under the counters
   * rather than a small button floated into the corner below them.
   */
  const openInEditor = (className: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={openDocument}
    >
      <PencilIcon aria-hidden="true" />
      {t("openInEditor")}
    </Button>
  );

  return (
    <section aria-labelledby={`doc-${document.docId}`} data-testid="document-results">
      <div className="border-b pb-2">
        <div className="flex items-center gap-2.5">
          <h3
            id={`doc-${document.docId}`}
            className="flex min-w-0 flex-1 items-center gap-2 text-lg font-semibold tracking-[-0.01em]"
          >
            <DocumentIcon item={item} size="sm" />
            {/* The adjacent labelled button is the keyboard and screen-reader
                control. The name is intentionally only a pointer target, so Tab
                encounters one action rather than two identical actions. */}
            <span
              ref={nameRef}
              className="min-w-0 cursor-pointer font-mono break-all underline decoration-foreground/25 underline-offset-[3px] transition-colors hover:text-primary hover:decoration-primary"
              data-testid="document-name-open"
            >
              {document.name}
            </span>
          </h3>
          {openInEditor("hidden shrink-0 nav:inline-flex")}
        </div>

        {/* The measurements and the counters go under the heading and across
            the full width, as they do on the card in the buffer. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 nav:ps-9">
          <span className="font-mono text-[0.8125rem] text-muted-foreground">
            {volume}
          </span>
          <ProblemCounts counts={counts} notRun={notRun} />
        </div>

        {openInEditor("mt-2.5 w-full nav:hidden")}
      </div>

      {movedUnderFindings ? (
        <p
          role="status"
          data-testid="edited-after-run"
          className="mt-2 flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft p-2.5 text-[0.8125rem] text-warning"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t("editedAfterRun")}</span>
        </p>
      ) : null}

      {/* A wrapping row rather than a grid, and centred. A grid centres its
          columns but not what is in them: the last row is rarely full, and its
          one card stays in the first column, hanging off the left edge under
          three above it. A wrapping row centres every row it makes, including
          the last. */}
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {moduleIds.map((module, moduleIndex) => {
          const status = document.modules[module];
          if (status === undefined) return null;
          // A card appears as soon as its module has finished, without waiting
          // for the others.
          if (status.state === "queued" || status.state === "running") return null;
          return (
            <CheckCard
              key={module}
              docId={document.docId}
              documentName={document.name}
              module={module}
              status={status}
              result={job.results[resultKey(document.docId, module)]}
              arrivalIndex={moduleIndex}
              onRetry={(retried) => onRetryModule(document.docId, retried)}
            />
          );
        })}
      </div>
    </section>
  );
}

function ProblemCounts({
  counts,
  notRun = 0,
  className,
}: {
  readonly counts: Counts;
  readonly notRun?: number;
  readonly className?: string;
}) {
  const t = useTranslations("results.severity");
  const format = useFormatter();

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-critical" aria-hidden="true" />
        <strong className="font-mono font-semibold text-foreground">
          {format.number(counts.critical)}
        </strong>
        {t("criticalLabel", { count: counts.critical })}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-warning" aria-hidden="true" />
        <strong className="font-mono font-semibold text-foreground">
          {format.number(counts.warning)}
        </strong>
        {t("warningLabel", { count: counts.warning })}
      </span>
      {notRun > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          {/* A third form again, and a dash rather than a circle: it is the
              same mark the card without a score shows, and it says "nothing to
              report here" rather than "none of them". */}
          <span
            className="h-0.5 w-2.5 rounded-full bg-muted-foreground"
            aria-hidden="true"
          />
          <strong className="font-mono font-semibold text-foreground">
            {format.number(notRun)}
          </strong>
          {t("notRunLabel", { count: notRun })}
        </span>
      ) : null}
    </p>
  );
}

function notRunCount(document: JobDocument): number {
  return moduleIds.reduce(
    (count, module) => count + (document.modules[module]?.state === "skipped" ? 1 : 0),
    0,
  );
}

function hasAnyModule(document: JobDocument): boolean {
  return moduleIds.some((module) => document.modules[module] !== undefined);
}

function hasVisibleResult(document: JobDocument): boolean {
  return moduleIds.some((module) => {
    const state = document.modules[module]?.state;
    return state !== undefined && state !== "queued" && state !== "running";
  });
}

function orderByReadiness(documents: readonly JobDocument[]): readonly JobDocument[] {
  return documents
    .map((document, index) => ({ document, index, readyAt: firstFinishedAt(document) }))
    .sort((left, right) => left.readyAt - right.readyAt || left.index - right.index)
    .map(({ document }) => document);
}

function firstFinishedAt(document: JobDocument): number {
  let first = Number.POSITIVE_INFINITY;
  for (const moduleId of moduleIds) {
    const status = document.modules[moduleId];
    if (
      status === undefined ||
      status.state === "queued" ||
      status.state === "running" ||
      status.finishedAt === undefined
    ) {
      continue;
    }
    const timestamp = Date.parse(status.finishedAt);
    if (!Number.isNaN(timestamp)) first = Math.min(first, timestamp);
  }
  return first;
}

function latestFinishedAt(documents: readonly JobDocument[]): string | null {
  let latest: { readonly value: string; readonly time: number } | null = null;
  for (const document of documents) {
    for (const moduleId of moduleIds) {
      const value = document.modules[moduleId]?.finishedAt;
      if (value === undefined) continue;
      const time = Date.parse(value);
      if (!Number.isNaN(time) && (latest === null || time > latest.time)) {
        latest = { value, time };
      }
    }
  }
  return latest?.value ?? null;
}
