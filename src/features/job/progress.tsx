"use client";

import * as React from "react";
import { CheckIcon, CircleDashedIcon, LoaderIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { DocumentIcon } from "@/components/document-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { type BufferItem, type JobStage, type JobStatus } from "@/lib/domain";
import { useWording } from "@/lib/i18n";
import { useBufferStore } from "@/stores";

import { asMinutesAndSeconds, useNow } from "./clock";

/**
 * The progress of the run, stage by stage rather than as one spinner. Parsing
 * is now entirely in the browser and happens before the run, so the job starts
 * straight at the checks - but the external databases have not gone anywhere
 * and the duration is still unpredictable. A single spinner for an unknown
 * length of time reads as a hang.
 */
export function Progress({
  status,
  onCancel,
  cancelling = false,
}: {
  readonly status: JobStatus;
  readonly onCancel: () => void;
  readonly cancelling?: boolean;
}) {
  const t = useTranslations("job");
  const phrase = useWording();
  const elapsed = useElapsed(status.createdAt);
  const items = useBufferStore((state) => state.items);

  /*
   * Announced when the stage changes, not on every tick of the timer: a live
   * region that speaks every second says nothing. The document is named
   * alongside the check, because "BibCheck" three times over is what the screen
   * used to say to somebody who cannot see it.
   */
  const running = status.stages.filter((stage) => stage.state === "running");
  const named = new Map(status.documents.map((document) => [document.docId, document]));
  const announcement = running
    .map((stage) => {
      const label = phrase(stage.labelKey, stage.labelParams);
      const document = stage.docId === undefined ? undefined : named.get(stage.docId);
      return document === undefined ? label : `${label} — ${document.name}`;
    })
    .join(", ");

  const jobStages = status.stages.filter((stage) => stage.docId === undefined);
  const perDocument = groupByDocument(status, items);

  return (
    <section aria-labelledby="progress-heading" data-testid="progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <LoaderIcon
            className="mt-0.5 size-6 shrink-0 animate-spin text-primary"
            data-motion="busy"
            aria-hidden="true"
          />
          <div>
            <h2
              id="progress-heading"
              className="text-[1.375rem] font-semibold tracking-[-0.01em]"
            >
              {t("checkingTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{elapsed}</span> {t("elapsed")}{" "}
              <span aria-hidden="true">·</span> {t("resultsAppear")}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {cancelling ? t("cancelling") : t("cancel")}
        </Button>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* The stages that belong to the run rather than to any one document -
            the text being accepted, and whatever else the job does before it
            starts checking. They have no document to stand under. */}
        {jobStages.length === 0 ? null : (
          <ol>
            {jobStages.map((stage) => (
              <StageRow key={stage.id} stage={stage} />
            ))}
          </ol>
        )}

        {perDocument.map((group) => (
          <section key={group.docId} className="border-b last:border-b-0">
            {/* The document, then the checks running on it - the same three
                levels the results screen is built from, because it is the same
                question: what is happening to this file. A flat list of module
                names answers it only for a buffer of one. */}
            <h3 className="flex items-center gap-2 border-b bg-muted/40 px-3.5 py-2">
              <DocumentIcon item={group.item} size="sm" />
              <span className="min-w-0 flex-1 font-mono text-sm font-medium break-all">
                {group.name}
              </span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {t("checksDone", { done: group.done, total: group.stages.length })}
              </span>
            </h3>
            <ol>
              {group.stages.map((stage) => (
                <StageRow key={stage.id} stage={stage} indented />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}

/**
 * The stages of one run, gathered under the document each belongs to. The order
 * of the documents is the order the server sent them in, which is the order
 * they were submitted: the run has not finished, so there is no readiness to
 * sort by yet, and a list that reordered itself while being read would be worse
 * than one that did not.
 */
function groupByDocument(status: JobStatus, items: readonly BufferItem[]) {
  const named = new Map(status.documents.map((document) => [document.docId, document]));
  const order: string[] = [];
  const stages = new Map<string, JobStage[]>();

  for (const stage of status.stages) {
    if (stage.docId === undefined) continue;
    if (!stages.has(stage.docId)) {
      stages.set(stage.docId, []);
      order.push(stage.docId);
    }
    stages.get(stage.docId)?.push(stage);
  }

  return order.map((docId) => {
    const mine = stages.get(docId) ?? [];
    return {
      docId,
      name: named.get(docId)?.name ?? docId,
      item: items.find((candidate) => candidate.id === docId),
      stages: mine,
      done: mine.filter((stage) => stage.state === "done").length,
    };
  });
}

function useElapsed(startedAt: string): string {
  const now = useNow();
  const started = Date.parse(startedAt);
  return Number.isNaN(started) || now === 0
    ? asMinutesAndSeconds(0)
    : asMinutesAndSeconds(now - started);
}

/** One stage: what it is, how far it has got, and how long it has taken. */
function StageRow({
  stage,
  indented = false,
}: {
  readonly stage: JobStage;
  readonly indented?: boolean;
}) {
  const t = useTranslations("job");
  const phrase = useWording();

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3.5 py-2.5 text-sm last:border-b-0",
        // Aligned under the name of the document, past its mark, so the
        // nesting is read from the rows and not only from the band above them.
        indented && "ps-9",
      )}
      data-testid="stage-row"
      data-state={stage.state}
    >
      <StageIcon stage={stage} />
      <span className="min-w-28 font-medium max-[767px]:min-w-0 max-[767px]:flex-1">
        {phrase(stage.labelKey, stage.labelParams)}
      </span>
      <span className="min-w-0 flex-1 text-muted-foreground max-[767px]:order-4 max-[767px]:basis-full max-[767px]:ps-[1.875rem]">
        {stage.progress === undefined ? null : (
          <>
            {t("progressOf", {
              done: stage.progress.done,
              total: stage.progress.total,
            })}
            {stage.detailKey === undefined ? null : " · "}
          </>
        )}
        {stage.detailKey === undefined
          ? null
          : phrase(stage.detailKey, stage.detailParams)}
      </span>
      <Elapsed stage={stage} />
    </li>
  );
}

function StageIcon({ stage }: { readonly stage: JobStage }) {
  const className = "mt-0.5 size-4 shrink-0";
  switch (stage.state) {
    case "done":
      return <CheckIcon className={`${className} text-ok`} aria-hidden="true" />;
    case "running":
      return (
        <LoaderIcon
          className={`${className} animate-spin text-primary`}
          data-motion="busy"
          aria-hidden="true"
        />
      );
    case "error":
      return <XIcon className={`${className} text-critical`} aria-hidden="true" />;
    default:
      return (
        <CircleDashedIcon
          className={`${className} text-muted-foreground`}
          aria-hidden="true"
        />
      );
  }
}

/** How long the stage took, or how long it has been going. */
function Elapsed({ stage }: { readonly stage: JobStage }) {
  // One shared clock rather than a timer of its own: on fifty documents a
  // timer per row is fifty wake-ups a second to print the same second.
  const now = useNow();

  if (stage.startedAt === undefined) return null;
  const started = Date.parse(stage.startedAt);
  const running = stage.finishedAt === undefined;
  const ended = running ? now : Date.parse(stage.finishedAt ?? "");
  if (Number.isNaN(started) || Number.isNaN(ended) || ended === 0) return null;

  const took = ended - started;
  /*
   * A stage still going always shows its clock, from the first second: that
   * clock is the evidence that something is happening, and starting it at zero
   * is how a person sees it move.
   *
   * A stage that has finished shows how long it took - and a step that took
   * less than a second took no time worth printing. Accepting the text is such
   * a step, and it is the first row on the screen: "0:00" sitting there while
   * the rows under it count upwards reads as a clock that has stopped rather
   * than as work that was instant.
   */
  if (!running && asMinutesAndSeconds(took) === "0:00") return null;

  return (
    <span className="shrink-0 font-mono text-xs text-muted-foreground">
      {asMinutesAndSeconds(took)}
    </span>
  );
}
