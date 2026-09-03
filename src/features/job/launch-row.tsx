"use client";

import { PlayIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { BlockedButton } from "@/components/ui/blocked-button";
import { Button } from "@/components/ui/button";
import { type BufferItem } from "@/lib/domain";
import { isPaidModule } from "@/lib/entitlements";
import { totalChars, useEntitlementsStore } from "@/stores";

import { sendingItems } from "@/features/plan/compute";

import { RunFailureNotice } from "./run-failure";
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
  const format = useFormatter();
  const entitlements = useEntitlementsStore((state) => state.entitlements);

  // The companions go with them, so this number is the number that leaves.
  const sending = sendingItems(items, entitlements);
  const accessState =
    entitlements === null ? "unknown" : entitlements.access ? "open" : "closed";
  // Which checks are paid is read from the one table of rights, not listed
  // again here: a boundary written out twice moves in one place first.
  const paidRequested = items.some((item) => item.checks.some(isPaidModule));
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
          {/* Shown only when a paid check is in the plan: a run of free checks
              has nothing to say here, because free checks have no limit for
              anybody.

              What it says comes from `access` alone. Whether a check may be
              ticked is a different question with a different field behind it,
              and an account with an unspent trial run has them disagreeing -
              `cite.allowed: true` with `access: false` - so a line worked out
              from the ticks would be wrong on most accounts.

              And there is no number in it. The days of access are spent by the
              server, in the server's own time zone, from whichever device the
              person is using; anything counted down here would be a second
              opinion that is sometimes right. */}
          {paidRequested ? (
            <>
              <p data-testid="paid-access-line" data-access={accessState}>
                {accessState === "unknown"
                  ? t("accessChecking")
                  : accessState === "closed"
                    ? t("accessLocked")
                    : entitlements?.periodEndsAt === undefined
                      ? t("accessOpen")
                      : t("accessOpenUntil", {
                          date: format.dateTime(new Date(entitlements.periodEndsAt), {
                            day: "numeric",
                            month: "short",
                          }),
                        })}
              </p>
              {/* Said before the run rather than after it: told nothing, people
                  send their documents one at a time to make the access last,
                  and get the same checks slower for the same day. */}
              {accessState === "open" ? (
                <p data-testid="paid-no-limits">{t("accessNoLimits")}</p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {failure === null ? null : <RunFailureNotice failure={failure} />}
    </div>
  );
}
