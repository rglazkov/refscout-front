"use client";

import * as React from "react";
import { DownloadIcon, LoaderIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { site } from "@/lib/brand";
import { type Job } from "@/lib/domain";
import { downloadJobReport } from "@/lib/export";
import { useWording } from "@/lib/i18n";
import { useJobStore } from "@/stores";

/**
 * A sentence out of the dictionary with its placeholders left standing.
 *
 * `next-intl` formats on the way out and refuses a sentence whose values it was
 * not given - which is right almost everywhere and wrong here, where the values
 * belong to a page that has not been drawn yet. `raw` is its own way through,
 * and the check is the price of it: the value behind a key in a dictionary can
 * be anything, and what this asks for is a string.
 */
function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Download on the results screen is one action and produces one file: the
 * findings report over the whole job, as a PDF. It is the main thing the
 * product makes here - a person takes it away and works through their
 * manuscript from it, on a screen or on paper.
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
  /**
   * Whether the file is being written. Writing it means starting a worker,
   * fetching four faces and drawing every finding, which is not instant over a
   * long job - and a button that looks idle while that happens is a button
   * somebody presses again.
   */
  const [writing, setWriting] = React.useState(false);

  const severity = {
    critical: report("severity.critical"),
    warning: report("severity.warning"),
    info: report("severity.info"),
  };

  const build = (): void => {
    // A second press while the first is still being written is ignored rather
    // than queued: two presses mean one file, and the person meant the first.
    if (writing) return;
    setWriting(true);
    void downloadJobReport({
      job,
      fixed: new Set(Object.keys(fixed)),
      ignored: new Set(Object.keys(ignored)),
      fileName: report("fileName"),
      title: report("title"),
      generatedAt: report("generatedAt", { date: format.dateTime(new Date()) }),
      phrase: (key, params, fallback) => phrase(key, params, fallback),
      producer: site.name,
      /*
       * The running foot is asked for unformatted. Its two numbers are not
       * known here - the second of them is the number of pages, which nothing
       * knows until the last one is drawn - so what the writer needs is the
       * sentence with its places still in it, and asking for the formatted one
       * would be asking the dictionary to fill in values that do not exist yet.
       */
      wording: { pageNumbers: asText(report.raw("pageNumbers")), severity },
      labels: {
        severity,
        module: (module) => checkName(module),
        line: report("line"),
        page: report("page"),
        fixed: report("fixed"),
        ignored: report("ignored"),
        replacement: report("replacement"),
        unanchored: report("unanchored"),
        editedAfterRun: report("editedAfterRun"),
        edited: report("edited"),
        lost: report("lost"),
        nothing: report("nothing"),
        doi: report("doi"),
      },
    }).finally(() => {
      setWriting(false);
    });
  };

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={build}
      aria-busy={writing}
      data-testid="download-report"
    >
      {writing ? (
        <LoaderIcon className="animate-spin" aria-hidden="true" />
      ) : (
        <DownloadIcon aria-hidden="true" />
      )}
      {t("downloadReport")}
    </Button>
  );
}
