"use client";

import * as React from "react";
import { CheckIcon, CircleDashedIcon, LoaderIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { type JobStage, type JobStatus } from "@/lib/domain";

/**
 * The progress of the run, stage by stage rather than as one spinner (M1.8.4).
 * Parsing is now entirely in the browser and happens before the run, so the job
 * starts straight at the checks - but the external databases have not gone
 * anywhere and the duration is still unpredictable. A single spinner for an
 * unknown length of time reads as a hang (§8).
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
  const phrase = useTranslations();
  const elapsed = useElapsed(status.createdAt);

  // Announced when the stage changes, not on every tick of the timer: a live
  // region that speaks every second says nothing (§8).
  const running = status.stages.filter((stage) => stage.state === "running");
  const announcement = running
    .map((stage) => phrase(stage.labelKey, stage.labelParams))
    .join(", ");

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

      <ol className="mt-4 overflow-hidden rounded-xl border bg-card shadow-sm">
        {status.stages.map((stage) => (
          <li
            key={stage.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3.5 py-2.5 text-sm last:border-b-0"
          >
            <StageIcon stage={stage} />
            <span className="min-w-36 font-medium max-[767px]:min-w-0 max-[767px]:flex-1">
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
        ))}
      </ol>
    </section>
  );
}

function useElapsed(startedAt: string): string {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const started = Date.parse(startedAt);
  const seconds = Number.isNaN(started)
    ? 0
    : Math.max(0, Math.round((now - started) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
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
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (stage.state !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [stage.state]);

  if (stage.startedAt === undefined) return null;
  const started = Date.parse(stage.startedAt);
  const ended = stage.finishedAt === undefined ? now : Date.parse(stage.finishedAt);
  if (Number.isNaN(started) || Number.isNaN(ended)) return null;

  const seconds = Math.max(0, Math.round((ended - started) / 1000));
  return (
    <span className="shrink-0 font-mono text-xs text-muted-foreground">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}
