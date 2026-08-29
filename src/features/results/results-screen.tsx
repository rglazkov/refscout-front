"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  DownloadIcon,
  FileTextIcon,
  LibraryIcon,
  PencilIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Collapse } from "@/components/motion/collapse";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { extensionOf } from "@/lib/docs";
import {
  type Counts,
  type Job,
  type JobDocument,
  type ModuleId,
  moduleIds,
  resultKey,
} from "@/lib/domain";
import { downloadDocumentText, downloadJobReport, downloadText } from "@/lib/export";
import { documentCounts, jobCounts } from "@/lib/normalize";
import { useBufferStore, useJobStore, useUiStore } from "@/stores";

import { CheckCard } from "./check-card";

/**
 * The results (§9). Three levels and no extra screen: a document, then the
 * cards of its checks, then the findings inside a card. The top level is the
 * document, because a person works with a manuscript rather than with a module,
 * and "what is wrong with this file" gets a direct answer.
 *
 * No job is created from this screen - not by any path (M1.9.5). The invariant
 * is worded that way rather than as "no text is sent", because a test is
 * written from this wording and it stays true when a single failed module is
 * re-run inside the job that already exists.
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
  const [confirming, setConfirming] = React.useState(false);

  const totals = jobCounts(job);
  const documents = orderByReadiness(job.status.documents).filter(
    (document) => !running || hasVisibleResult(document),
  );
  const notRun = job.status.documents.reduce(
    (total, document) => total + notRunCount(document),
    0,
  );
  const checkedAt = latestFinishedAt(job.status.documents) ?? job.status.createdAt;

  if (running && documents.length === 0) return null;

  return (
    <section
      className={running ? "mt-5" : "mt-6"}
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
                  when: format.relativeTime(new Date(checkedAt)),
                })}
              </p>
            </div>
            <div className="flex gap-2">
              <DownloadMenu job={job} />
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

          {/* It destroys the documents, the edits and everything stored, and there
          is nowhere to get them back from. So it asks before the clearing
          rather than reporting the loss after it (M1.9.6). */}
          {confirming ? (
            <div
              role="alertdialog"
              aria-label={t("newCheckTitle")}
              data-testid="new-check-confirm"
              className="mt-3 rounded-lg border border-critical-border bg-critical-soft p-3 text-sm"
            >
              <p>{t("newCheckConfirm")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <DownloadReportButton job={job} />
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setConfirming(false);
                    onNewCheck();
                  }}
                >
                  {t("newCheckYes")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : null}
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

  const volume =
    item !== undefined &&
    (item.extract.state === "ready" || item.extract.state === "partial")
      ? bufferT("volume", {
          words: format.number(item.extract.words),
          chars: format.number(item.extract.chars),
        })
      : t("characters", { chars: format.number(document.cpLength) });

  return (
    <section aria-labelledby={`doc-${document.docId}`} data-testid="document-results">
      <div className="flex flex-wrap items-center gap-2.5 border-b pb-2">
        <h3
          id={`doc-${document.docId}`}
          className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-[-0.01em]"
        >
          <ResultDocumentIcon item={item} />
          {/* The adjacent labelled button is the keyboard and screen-reader
              control. The name is intentionally only a pointer target, so Tab
              encounters one action rather than two identical actions. */}
          <span
            ref={nameRef}
            className="min-w-0 cursor-pointer break-all underline decoration-foreground/25 underline-offset-[3px] transition-colors hover:text-primary hover:decoration-primary"
            data-testid="document-name-open"
          >
            {document.name}
          </span>
        </h3>
        <span className="text-[0.8125rem] text-muted-foreground">{volume}</span>
        <ProblemCounts counts={counts} notRun={notRun} />
        {/* The result opens the same live document that the buffer used. Edits
            apply immediately to the text that Download returns. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ms-auto"
          onClick={openDocument}
        >
          <PencilIcon aria-hidden="true" />
          {t("openInEditor")}
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(14rem,21rem))]">
        {moduleIds.map((module, moduleIndex) => {
          const status = document.modules[module];
          if (status === undefined) return null;
          // A card appears as soon as its module has finished, without waiting
          // for the others (§8).
          if (status.state === "queued" || status.state === "running") return null;
          return (
            <CheckCard
              key={module}
              docId={document.docId}
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

/** The findings report, and the text of each document as it stands (M1.10). */
function DownloadMenu({ job }: { readonly job: Job }) {
  const t = useTranslations("results");
  const items = useBufferStore((state) => state.items);
  const [open, setOpen] = React.useState(false);

  const artifacts = Object.values(job.results).flatMap((result) =>
    result.artifacts.map((artifact) => ({ result, artifact })),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="default" size="sm" data-testid="download-menu">
          <DownloadIcon aria-hidden="true" />
          {t("download")}
          <ChevronDownIcon
            className={cn(
              "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
              open && "rotate-180",
            )}
            aria-hidden="true"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72 p-2">
        <ul className="space-y-1">
          <li>
            <DownloadReportButton job={job} />
          </li>
          {job.status.documents.map((document) => {
            const item = items.find((candidate) => candidate.id === document.docId);
            const extension =
              item === undefined ? "txt" : extensionOf(item.name) || "txt";
            return (
              <li key={document.docId}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() =>
                    downloadDocumentText(document.docId, document.name, extension)
                  }
                >
                  {t("downloadText", { name: document.name })}
                </Button>
              </li>
            );
          })}
          {artifacts.map(({ result, artifact }, index) => (
            <li key={`${result.docId}-${index}`}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() =>
                  downloadText(
                    artifact.content,
                    documentNameOf(job, result.docId),
                    `-${result.module}`,
                    artifact.kind,
                  )
                }
              >
                {t("downloadArtifact", { module: result.module })}
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
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
        <span
          className="size-2.5 rounded-full bg-[var(--critical-dot)] ring-1 ring-critical"
          aria-hidden="true"
        />
        <strong className="font-mono font-semibold text-foreground">
          {format.number(counts.critical)}
        </strong>
        {t("criticalLabel", { count: counts.critical })}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full bg-[var(--warning-dot)] ring-1 ring-warning"
          aria-hidden="true"
        />
        <strong className="font-mono font-semibold text-foreground">
          {format.number(counts.warning)}
        </strong>
        {t("warningLabel", { count: counts.warning })}
      </span>
      {notRun > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-muted-foreground" aria-hidden="true" />
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

function ResultDocumentIcon({
  item,
}: {
  readonly item: ReturnType<typeof useBufferStore.getState>["items"][number] | undefined;
}) {
  const className = "size-4";
  const icon =
    item?.detected === "bibtex" ? (
      <LibraryIcon className={className} aria-hidden="true" />
    ) : item?.origin === "typed" ? (
      <PencilIcon className={className} aria-hidden="true" />
    ) : (
      <FileTextIcon className={className} aria-hidden="true" />
    );

  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function documentNameOf(job: Job, docId: string): string {
  return (
    job.status.documents.find((document) => document.docId === docId)?.name ?? "document"
  );
}

/**
 * The report is the main thing the product produces in this section: a person
 * takes it into their own editor and fixes the manuscript there (M1.10.2).
 */
function DownloadReportButton({ job }: { readonly job: Job }) {
  const t = useTranslations("results");
  const report = useTranslations("report");
  const checkName = useTranslations("capabilities");
  const phrase = useTranslations();
  const format = useFormatter();
  const fixed = useJobStore((state) => state.fixed);

  const build = () => {
    downloadJobReport({
      job,
      fixed: new Set(fixed),
      fileName: report("fileName"),
      title: report("title"),
      generatedAt: report("generatedAt", { date: format.dateTime(new Date()) }),
      phrase: (key, params) => phrase(key, params),
      labels: {
        severity: {
          critical: report("severity.critical"),
          warning: report("severity.warning"),
          info: report("severity.info"),
        },
        module: (module) => checkName(module),
        line: report("line"),
        page: report("page"),
        quote: report("quote"),
        fixed: report("fixed"),
        counts: (counts: Counts) =>
          report("counts", { critical: counts.critical, warning: counts.warning }),
        nothing: report("nothing"),
      },
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      onClick={build}
      data-testid="download-report"
    >
      {t("downloadReport")}
    </Button>
  );
}
