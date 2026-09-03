"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ReportProblemButton } from "@/features/feedback/report-problem";
import { messageKeyFor } from "@/lib/api";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

import { type RunFailure as Failure } from "./use-run";

/**
 * A refusal of the run, and the one thing to do about it.
 *
 * Three of them are refusals about access rather than about the manuscript, and
 * each has its own way forward: an anonymous session is asked to sign in, a
 * closed period is offered the page where access is bought, and a request that
 * came too fast is told how long to wait. Answering all three with "something
 * went wrong" leaves the person with the sentence and no action - and the
 * action is the whole content of these three cases.
 *
 * Nothing here says what the attempt cost. The server counts what was spent,
 * the client is not told, and "this one was free" is exactly the sentence we
 * have no right to make.
 */
export type Remedy = "sign-in" | "upgrade" | "wait" | "none";

export function remedyFor(failure: Failure): Remedy {
  if (failure.code === "AUTH_REQUIRED" || failure.status === 401) return "sign-in";
  if (failure.code === "ACCESS_CLOSED" || failure.status === 402) return "upgrade";
  if (failure.code === "RATE_LIMITED" || failure.status === 429) return "wait";
  return "none";
}

export function RunFailureNotice({ failure }: { readonly failure: Failure }) {
  const t = useTranslations("job");
  const errors = useTranslations();
  const locale = useLocale() as Locale;
  const remedy = remedyFor(failure);

  return (
    <div
      role="alert"
      className="mt-3 flex flex-wrap items-center gap-3 text-sm text-critical"
      data-testid="run-failure"
      data-remedy={remedy}
    >
      <p>
        {errors(messageKeyFor(failure.code))}
        {/* The identifier of the request, in the mono face because it is what a
            person copies into a support conversation letter for letter. */}
        {failure.requestId === "" ? null : (
          <span className="ms-1 font-mono text-muted-foreground">
            ({failure.requestId})
          </span>
        )}
      </p>

      {remedy === "wait" ? (
        <span data-testid="run-failure-wait">
          {t("retryAfter", { seconds: failure.retryAfterSec ?? 0 })}
        </span>
      ) : null}

      {/* A failed run carries the identifier of the request, and support finds
          the case in the logs by it. Nothing here says what the attempt cost:
          the server counts what was spent and the client is not told. */}
      <ReportProblemButton
        variant="outline"
        {...(failure.requestId === "" ? {} : { requestId: failure.requestId })}
      />

      {remedy === "sign-in" || remedy === "upgrade" ? (
        <Button asChild size="sm" variant="outline" data-testid="run-failure-action">
          <Link
            href={localizedPath(remedy === "sign-in" ? "/account/" : "/pricing/", locale)}
          >
            {remedy === "sign-in" ? t("signIn") : t("seePro")}
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
