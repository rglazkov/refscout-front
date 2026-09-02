"use client";

import { PlayIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { BlockedButton } from "@/components/ui/blocked-button";
import { Button } from "@/components/ui/button";
import { messageKeyFor } from "@/lib/api";
import { type BufferItem } from "@/lib/domain";
import { totalChars, useEntitlementsStore } from "@/stores";

import { sendingItems } from "@/features/plan/compute";

import { type RunFailure } from "./use-run";

/**
 * The button, and the sentence under it.
 *
 * The sentence is literal: "text will be sent: 3 documents, 61 800 characters".
 * It describes the fact of the action about to happen and makes no promise
 * about privacy - promises live in the privacy policy, not under a button.
 */
export function LaunchRow({
  items,
  pending,
  failure,
  onRun,
}: {
  readonly items: readonly BufferItem[];
  readonly pending: boolean;
  readonly failure: RunFailure | null;
  readonly onRun: (items: readonly BufferItem[], buffer: readonly BufferItem[]) => void;
}) {
  const t = useTranslations("job");
  const errors = useTranslations();
  const format = useFormatter();
  const entitlements = useEntitlementsStore((state) => state.entitlements);

  // The companions go with them, so this number is the number that leaves.
  const sending = sendingItems(items, entitlements);
  const paidRequested = items.some((item) =>
    item.checks.some((module) => module === "presubmit" || module === "cite"),
  );
  if (items.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[linear-gradient(180deg,var(--card),var(--primary-soft))] p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-4 max-[767px]:flex-col max-[767px]:items-stretch">
        {/* A button that cannot run is not made `disabled`. It stays focusable,
            is marked `aria-disabled`, says why when it is pressed and reports
            the attempt - a grey button is a silent wall for the person and no
            signal at all for us. */}
        {sending.length === 0 ? (
          <BlockedButton action="job.run" reason={t("nothingToSend")} size="lg">
            <PlayIcon aria-hidden="true" />
            {t("run")}
          </BlockedButton>
        ) : (
          <Button
            type="button"
            size="lg"
            onClick={() => onRun(sending, items)}
            data-testid="run"
            aria-busy={pending}
          >
            <PlayIcon aria-hidden="true" />
            {pending ? t("running") : t("run")}
          </Button>
        )}
        <div className="flex flex-col gap-0.5 text-right text-[0.8125rem] text-muted-foreground max-[767px]:text-left">
          {/* The mono face is for the quantities, not for the sentence around
              them: setting the whole line in it makes a label look like a
              measurement. */}
          <p data-testid="launch-line">
            <strong className="font-semibold text-foreground">
              {t("textToSend", { documents: sending.length })}
            </strong>{" "}
            ·{" "}
            <span className="font-mono">
              {t("characters", { chars: format.number(totalChars(sending)) })}
            </span>
          </p>
          {paidRequested ? (
            <p data-testid="paid-access-line">
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
                  : t("accessLocked")}
            </p>
          ) : null}
        </div>
      </div>

      {failure === null ? null : (
        <p role="alert" className="mt-3 text-sm text-critical" data-testid="run-failure">
          {errors(messageKeyFor(failure.code))}
          {failure.requestId === "" ? "" : ` (${failure.requestId})`}
        </p>
      )}
    </div>
  );
}
