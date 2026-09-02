import { docRegistry } from "@/lib/docs";
import { type Job, moduleIds, resultKey } from "@/lib/domain";
import { anchoringOf, documentCounts, issuesOf } from "@/lib/normalize";

import { downloadText } from "./download";
import { buildIssueReport, type ReportInput, type ReportLabels } from "./report";

/**
 * The report over a whole job. It lives here rather than on the screen because
 * assembling a file is the one other place besides intake, the editor and the
 * API that is allowed to see the text of a document: the line numbers and the
 * quotes in the report are computed from the text the browser holds, and no
 * screen needs to hold it to ask for that.
 */
export function buildJobReport(input: {
  readonly job: Job;
  readonly fixed: ReadonlySet<string>;
  readonly ignored: ReadonlySet<string>;
  readonly title: string;
  readonly generatedAt: string;
  readonly phrase: ReportInput["phrase"];
  readonly labels: ReportLabels;
}): string {
  return buildIssueReport({
    title: input.title,
    generatedAt: input.generatedAt,
    phrase: input.phrase,
    labels: input.labels,
    documents: input.job.status.documents.map((document) => {
      const content = docRegistry.get(document.docId);
      // Which of this document's checks read a text that is not the one we
      // hold. Their findings go in without line and page numbers, and the
      // report says why in one line.
      const unanchored = new Set(
        moduleIds.filter((module) => {
          const result = input.job.results[resultKey(document.docId, module)];
          return result !== undefined && !anchoringOf(result).anchored;
        }),
      );
      return {
        docId: document.docId,
        name: document.name,
        counts: documentCounts(document.modules),
        ...(content === undefined ? {} : { text: content.text }),
        ...(content?.pages === undefined ? {} : { pages: content.pages }),
        issues: moduleIds.flatMap((module) => {
          const result = input.job.results[resultKey(document.docId, module)];
          return result === undefined ? [] : issuesOf(result);
        }),
        fixed: input.fixed,
        ignored: input.ignored,
        unanchored,
      };
    }),
  });
}

export function downloadJobReport(
  input: Parameters<typeof buildJobReport>[0] & { readonly fileName: string },
): void {
  downloadText(buildJobReport(input), input.fileName, "", "md");
}
