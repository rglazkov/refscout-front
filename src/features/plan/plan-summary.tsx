"use client";

import * as React from "react";
import { ChevronDownIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Collapse } from "@/components/motion/collapse";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/cn";
import { type BufferItem } from "@/lib/domain";
import { useEntitlementsStore, usePlanStore, useUiStore } from "@/stores";

import { buildPlan, enabledModules, exclusionsOf, hasText } from "./compute";

/**
 * What is about to happen, in one block between the buffer and the button
 * (§7). It shows the make-up of the run, says why a document is not taking
 * part, and lists the venues by document - because the venue belongs to the
 * manuscript, and two manuscripts mean two venues (M1.4.5).
 */
export function PlanSummary({ items }: { readonly items: readonly BufferItem[] }) {
  const t = useTranslations("plan");
  const checkName = useTranslations("capabilities");
  const format = useFormatter();
  const options = usePlanStore((state) => state.options);
  const entitlements = useEntitlementsStore((state) => state.entitlements);
  const openPaywall = useUiStore((state) => state.openPaywall);
  const [expanded, setExpanded] = React.useState(false);

  const plan = buildPlan(items, options, entitlements);
  const running = enabledModules(plan);
  const exclusions = exclusionsOf(items);
  const venues = items.filter(
    (item) => item.checks.includes("presubmit") && hasText(item),
  );
  const paidTicked = items.some((item) =>
    item.checks.some((module) => module === "presubmit" || module === "cite"),
  );
  const lockedRequested = (["presubmit", "cite"] as const).filter(
    (module) =>
      entitlements?.modules[module].allowed === false &&
      items.some((item) => item.checks.includes(module)),
  );

  if (items.length === 0) return null;

  return (
    <section
      className="mt-4 flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-sm"
      aria-labelledby="plan-heading"
      data-testid="check-plan"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="plan-heading" className="text-xs font-semibold tracking-wide uppercase">
          {t("heading")}
        </h2>

        {/* Every field the product has is kept; they simply stop being the
            first thing a person sees (M1.6.4). */}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="-me-1"
          aria-expanded={expanded}
          aria-controls="plan-settings"
          onClick={() => setExpanded(!expanded)}
        >
          {t("configure")}
          <ChevronDownIcon
            className={cn(
              "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
              !expanded && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </Button>
      </div>

      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        data-testid="plan-running"
      >
        <span className="text-muted-foreground">{t("willRunLabel")}</span>
        {running.length === 0 ? (
          <span className="text-muted-foreground">{t("nothingToRun")}</span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {running.map((module) => (
              <span
                key={module}
                className="rounded-sm border border-primary/35 bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary"
              >
                {checkName(module)}
              </span>
            ))}
          </span>
        )}
      </div>

      <div
        className="flex flex-wrap items-center gap-2 text-sm"
        data-testid="plan-venues"
      >
        <span className="text-muted-foreground">{t("venuesLabel")}</span>
        {venues.length === 0 ? (
          <span className="text-muted-foreground">{t("venuesNone")}</span>
        ) : (
          venues.map((item) => (
            <span
              key={item.id}
              className={cn(
                "rounded-sm border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground",
                item.venue === undefined &&
                  "border-warning-border bg-warning-soft text-warning",
              )}
            >
              <span className="font-mono">{item.name}</span> →{" "}
              {item.venue?.source ?? t("venueNotSet")}
            </span>
          ))
        )}
      </div>

      <hr className="border-0 border-t" />

      {paidTicked ? (
        <div className="flex items-start gap-2 text-[0.8125rem] text-muted-foreground">
          <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            {lockedRequested.length === 0 ? null : (
              <span className="mb-1.5 flex flex-wrap gap-1.5">
                {lockedRequested.map((module) => (
                  <span
                    key={module}
                    className="inline-flex items-center gap-1 rounded-sm border border-warning-border bg-warning-soft px-2 py-0.5 font-semibold text-warning"
                  >
                    <LockIcon className="size-3" aria-hidden="true" />
                    {checkName(module)}
                  </span>
                ))}
              </span>
            )}
            {entitlements === null
              ? t("accessChecking")
              : entitlements.modules.presubmit.allowed &&
                  entitlements.modules.cite.allowed
                ? entitlements.periodEndsAt === undefined
                  ? t("accessOpen")
                  : t("accessOpenUntil", {
                      date: format.dateTime(new Date(entitlements.periodEndsAt), {
                        day: "numeric",
                        month: "short",
                      }),
                    })
                : t("accessLocked")}{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() =>
                openPaywall(
                  entitlements?.modules.cite.allowed === false ? "cite" : "presubmit",
                )
              }
            >
              {t("learnPaid")}
            </button>
          </div>
        </div>
      ) : null}

      {exclusions.map((exclusion) => (
        <p
          key={exclusion.docId}
          className="flex items-start gap-2 text-[0.8125rem] text-muted-foreground"
          data-testid="plan-exclusions"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-mono text-foreground">{exclusion.name}</span>{" "}
            {t("excluded", { reason: t(`reason.${exclusion.reason}`) })}
          </span>
        </p>
      ))}

      <Collapse open={expanded} id="plan-settings">
        <AdvancedSettings />
      </Collapse>
    </section>
  );
}

function AdvancedSettings() {
  const t = useTranslations("plan.settings");
  const options = usePlanStore((state) => state.options);
  const setBibcheck = usePlanStore((state) => state.setBibcheck);
  const setGlossary = usePlanStore((state) => state.setGlossary);
  const setPresubmit = usePlanStore((state) => state.setPresubmit);
  const setCite = usePlanStore((state) => state.setCite);

  return (
    <div className="mt-2 space-y-4 rounded-lg border bg-card p-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("bibcheck")}</legend>
        <label htmlFor="opt-verify-live" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="opt-verify-live"
            checked={options.bibcheck.verifyLive}
            onCheckedChange={(checked) => setBibcheck({ verifyLive: checked === true })}
          />
          {t("verifyLive")}
        </label>
        <label htmlFor="opt-show-orphans" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="opt-show-orphans"
            checked={options.bibcheck.showOrphans}
            onCheckedChange={(checked) => setBibcheck({ showOrphans: checked === true })}
          />
          {t("showOrphans")}
        </label>
        <label htmlFor="opt-count-commented" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="opt-count-commented"
            checked={options.bibcheck.countCommented}
            onCheckedChange={(checked) =>
              setBibcheck({ countCommented: checked === true })
            }
          />
          {t("countCommented")}
        </label>
        <label htmlFor="opt-unify-keys" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="opt-unify-keys"
            checked={options.bibcheck.unifyKeys}
            onCheckedChange={(checked) => setBibcheck({ unifyKeys: checked === true })}
          />
          {t("unifyKeys")}
        </label>
        <label htmlFor="opt-key-format" className="block text-sm">
          {t("keyFormat")}
          <select
            id="opt-key-format"
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={options.bibcheck.keyFormat}
            onChange={(event) =>
              setBibcheck({
                keyFormat: event.target.value as typeof options.bibcheck.keyFormat,
              })
            }
          >
            {(
              [
                "author-year",
                "author-year-title",
                "author-title-year",
                "numeric",
              ] as const
            ).map((value) => (
              <option key={value} value={value}>
                {t(`keyFormats.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="opt-sort-by" className="block text-sm">
          {t("sortBy")}
          <select
            id="opt-sort-by"
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={options.bibcheck.sortBy}
            onChange={(event) =>
              setBibcheck({
                sortBy: event.target.value as typeof options.bibcheck.sortBy,
              })
            }
          >
            {(["author", "year", "title", "key", "cited-order", "original"] as const).map(
              (value) => (
                <option key={value} value={value}>
                  {t(`sortOrders.${value}`)}
                </option>
              ),
            )}
          </select>
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("glossary")}</legend>
        <label htmlFor="opt-domain" className="block text-sm">
          {t("domain")}
          <input
            id="opt-domain"
            aria-label={t("domain")}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={options.glossary.domain ?? ""}
            onChange={(event) => setGlossary({ domain: event.target.value })}
          />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("presubmit")}</legend>
        <label htmlFor="opt-anonymity" className="flex items-center gap-2 text-sm">
          <Checkbox
            id="opt-anonymity"
            checked={options.presubmit.anonymity}
            onCheckedChange={(checked) => setPresubmit({ anonymity: checked === true })}
          />
          {t("anonymity")}
        </label>
        <label htmlFor="opt-checklist" className="block text-sm">
          {t("checklist")}
          <textarea
            id="opt-checklist"
            aria-label={t("checklist")}
            rows={3}
            className="mt-1 w-full rounded-md border bg-background p-3 text-sm"
            value={options.presubmit.checklist ?? ""}
            onChange={(event) => setPresubmit({ checklist: event.target.value })}
          />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("cite")}</legend>
        <label htmlFor="opt-field" className="block text-sm">
          {t("field")}
          <input
            id="opt-field"
            aria-label={t("field")}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={options.cite.field ?? ""}
            onChange={(event) => setCite({ field: event.target.value })}
          />
        </label>
        <label htmlFor="opt-max-per-claim" className="block text-sm">
          {t("maxPerClaim")}
          <input
            id="opt-max-per-claim"
            aria-label={t("maxPerClaim")}
            type="number"
            min={1}
            max={20}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={options.cite.maxPerClaim}
            onChange={(event) =>
              setCite({ maxPerClaim: Math.max(1, Number(event.target.value) || 1) })
            }
          />
        </label>
        <label htmlFor="opt-instructions" className="block text-sm">
          {t("instructions")}
          <textarea
            id="opt-instructions"
            aria-label={t("instructions")}
            rows={3}
            className="mt-1 w-full rounded-md border bg-background p-3 text-sm"
            value={options.cite.instructions ?? ""}
            onChange={(event) => setCite({ instructions: event.target.value })}
          />
        </label>
      </fieldset>
    </div>
  );
}
