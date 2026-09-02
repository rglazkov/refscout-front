"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { type Counts, type Severity } from "@/lib/domain";

/** A filled counter dot; the adjacent label names the severity explicitly. */
export const TONE: Readonly<Record<Severity, string>> = {
  critical: "bg-critical",
  warning: "bg-warning",
  info: "bg-muted-foreground",
};

export function SeverityDots({ counts }: { readonly counts: Counts }) {
  const t = useTranslations("results.severity");
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
      {(["critical", "warning"] as const).map((severity) => (
        <span key={severity} className="inline-flex items-center gap-1">
          <span
            className={cn("size-2.5 rounded-full", TONE[severity])}
            aria-hidden="true"
          />
          {t(severity, { count: counts[severity] })}
        </span>
      ))}
    </p>
  );
}
