"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/telemetry";

/**
 * The way to say what happened, fetched with the failure rather than with the
 * page: this fallback is drawn on the day something breaks and on no other.
 */
const ReportProblemButton = dynamic(
  () =>
    import("@/features/feedback/report-problem").then(
      (module) => module.ReportProblemButton,
    ),
  { ssr: false },
);

type ZoneBoundaryProps = {
  /** The zone name cannot be expressed as a number, so the event carries a code. */
  readonly zone:
    | "intake"
    | "buffer"
    | "plan"
    | "job"
    | "results"
    | "scout"
    | "diff"
    | "shell"
    | "account"
    | "workspace";
  readonly children: React.ReactNode;
};

/**
 * An error boundary around one zone of the screen. A crashed list of findings
 * must not take down the buffer holding the text the user was editing, so each
 * zone carries its own: the drop zone, the list of documents, the plan on a
 * card, the run in progress and the findings all fail separately, and whichever
 * of them is still standing stays usable.
 *
 * The zone is also what the report says, so a crash names the part of the
 * screen it happened in rather than the screen.
 */
export function ZoneBoundary({ zone, children }: ZoneBoundaryProps) {
  const t = useTranslations("error");

  return (
    <ErrorBoundary
      onError={() => {
        track("react_error", { code: `RENDER_FAILED:${zone}` });
      }}
      fallbackRender={({ resetErrorBoundary }) => (
        <div
          role="alert"
          className="rounded-xl border border-critical-border bg-critical-soft p-4 text-critical"
        >
          <p className="font-medium">{t("zoneTitle")}</p>
          <p className="mt-1 text-sm opacity-90">{t("zoneBody")}</p>
          {/* Trying again, and saying what happened. The second is offered in
              every state of an error in the product: what the collector saw is
              a stack, and what the person saw is the sentence nobody else can
              write. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetErrorBoundary}>
              {t("retry")}
            </Button>
            <ReportProblemButton variant="outline" />
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
