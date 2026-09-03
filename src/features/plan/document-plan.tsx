"use client";

import { LockIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { type BufferItem } from "@/lib/domain";
import { useBufferStore, useEntitlementsStore } from "@/stores";

import { incompleteOf, lockOf, reasonNotRunning } from "./compute";
import { useLockPress } from "./use-lock";

/**
 * What will happen to this document, on this document's card.
 *
 * The plan belongs to the document rather than to the run. A buffer holding
 * three manuscripts is an ordinary buffer, and a single block at the bottom of
 * the page reading "BibCheck, PreSubmit and Cite will run" answers nothing a
 * person actually asks - which is what will happen to the file they are looking
 * at. Written per document it answers exactly that, next to the ticks and the
 * settings it is a summary of.
 *
 * It is a summary and never a second set of switches: everything it reports is
 * turned on somewhere above it on the same card.
 */
export function DocumentPlan({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("plan");
  const checkName = useTranslations("capabilities");
  const entitlements = useEntitlementsStore((state) => state.entitlements);
  const pressLock = useLockPress();
  const items = useBufferStore((state) => state.items);

  const running = item.checks.filter((module) => !lockOf(entitlements, module).locked);
  const locked = item.checks.filter((module) => lockOf(entitlements, module).locked);
  const incomplete = incompleteOf(item, items);
  const notRunning = reasonNotRunning(item);
  const venue = item.checks.includes("presubmit") ? item.venue : undefined;

  return (
    <section
      className="mt-2 space-y-1.5 rounded-lg border bg-card p-3"
      aria-label={t("headingFor", { name: item.name })}
      data-testid="check-plan"
    >
      <h4 className="text-xs font-semibold tracking-wide uppercase">{t("heading")}</h4>

      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        data-testid="plan-running"
      >
        <span className="text-muted-foreground">{t("willRunLabel")}</span>
        {running.length === 0 && locked.length === 0 ? (
          <span className="text-muted-foreground">{t("nothingToRun")}</span>
        ) : null}
        {running.map((module) => (
          <span
            key={module}
            className="rounded-sm border border-primary/35 bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary"
          >
            {checkName(module)}
          </span>
        ))}
        {/* A check the person ticked that access is closed for keeps its place
            here and says why, rather than vanishing from the summary. */}
        {locked.map((module) => (
          <button
            key={module}
            type="button"
            className="inline-flex items-center gap-1 rounded-sm border border-warning-border bg-warning-soft px-2 py-0.5 text-xs font-semibold text-warning"
            onClick={() => pressLock(module)}
          >
            <LockIcon className="size-3" aria-hidden="true" />
            {checkName(module)}
            <span className="sr-only">{t("learnPaid")}</span>
          </button>
        ))}
      </div>

      {item.checks.includes("presubmit") ? (
        <div
          className="flex flex-wrap items-center gap-2 text-sm"
          data-testid="plan-venue"
        >
          <span className="text-muted-foreground">{t("venuesLabel")}</span>
          <span
            className={cn(
              "rounded-sm border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground",
              venue === undefined && "border-warning-border bg-warning-soft text-warning",
            )}
          >
            {venue?.source ?? t("venueNotSet")}
          </span>
        </div>
      ) : null}

      {/* A check that will run without the text it was meant to read does less
          than it can, and the plan names it before the run rather than leaving
          it to be discovered in the results. */}
      {incomplete.map((module) => (
        <p
          key={module}
          className="flex items-start gap-2 text-[0.8125rem] text-muted-foreground"
          data-testid="plan-incomplete"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {t("incompleteHere", {
              module: checkName(module),
              missing: t(`missing.${module}`),
            })}
          </span>
        </p>
      ))}

      {notRunning === null ? null : (
        <p
          className="flex items-start gap-2 text-[0.8125rem] text-muted-foreground"
          data-testid="plan-exclusions"
          data-reason={notRunning}
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t("excludedHere", { reason: t(`reason.${notRunning}`) })}</span>
        </p>
      )}
    </section>
  );
}
