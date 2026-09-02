"use client";

import * as React from "react";
import { DownloadIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { type Counts, type Job } from "@/lib/domain";
import { downloadJobReport } from "@/lib/export";
import { useWording } from "@/lib/i18n";
import { useJobStore } from "@/stores";

/**
 * Download on the results screen is one action and produces one file: the
 * findings report over the whole job, in Markdown. It is the main thing the
 * product makes here - a person takes it into their own editor and fixes the
 * manuscript there.
 *
 * The text of a document is downloaded from the editor, where the person is
 * looking at the document in question, and a file a check produced is
 * downloaded from that check's card. A menu that offered the report, every
 * document and every artifact in one list turned the plainest action on the
 * screen into a choice between things that have nothing in common.
 */
export function DownloadReportButton({
  job,
  variant = "default",
  className,
}: {
  readonly job: Job;
  readonly variant?: React.ComponentProps<typeof Button>["variant"];
  readonly className?: string;
}) {
  const t = useTranslations("results");
  const report = useTranslations("report");
  const checkName = useTranslations("capabilities");
  const phrase = useWording();
  const format = useFormatter();
  const fixed = useJobStore((state) => state.fixed);
  const ignored = useJobStore((state) => state.ignored);

  const build = () => {
    downloadJobReport({
      job,
      fixed: new Set(Object.keys(fixed)),
      ignored: new Set(Object.keys(ignored)),
      fileName: report("fileName"),
      title: report("title"),
      generatedAt: report("generatedAt", { date: format.dateTime(new Date()) }),
      phrase: (key, params) => phrase(key, params),
      labels: {
        severity: {
          critical: report("severity.critical"),
          warning: report("severity.warning"),
          info: report("severity.info"),
        },
        module: (module) => checkName(module),
        line: report("line"),
        page: report("page"),
        quote: report("quote"),
        fixed: report("fixed"),
        ignored: report("ignored"),
        replacement: report("replacement"),
        unanchored: report("unanchored"),
        counts: (counts: Counts) =>
          report("counts", { critical: counts.critical, warning: counts.warning }),
        nothing: report("nothing"),
      },
    });
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={build}
      data-testid="download-report"
    >
      <DownloadIcon aria-hidden="true" />
      {t("downloadReport")}
    </Button>
  );
}
