"use client";

import { ErrorBoundary } from "react-error-boundary";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/telemetry";

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
        track("zone_error", { code: `RENDER_FAILED:${zone}` });
      }}
      fallbackRender={({ resetErrorBoundary }) => (
        <div
          role="alert"
          className="rounded-xl border border-critical-border bg-critical-soft p-4 text-critical"
        >
          <p className="font-medium">{t("zoneTitle")}</p>
          <p className="mt-1 text-sm opacity-90">{t("zoneBody")}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={resetErrorBoundary}
          >
            {t("retry")}
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
