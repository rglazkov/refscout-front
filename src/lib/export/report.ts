import { type Anchor, type Counts, type PageSpan, type Severity } from "@/lib/domain";
import { type PlacedIssue } from "@/lib/normalize";

/**
 * The findings report in Markdown (M1.10.2). In this first section it is the
 * main thing the product produces: a person takes it into their own editor and
 * fixes the manuscript there.
 *
 * The assembler is our own rather than a Markdown library's: what is needed is
 * a handful of headings and lists, and the text inside them is someone else's -
 * so it is placed as text and never interpreted.
 */
export type ReportInput = {
  readonly title: string;
  readonly generatedAt: string;
  readonly documents: readonly ReportDocument[];
  /** The dictionary, passed in: lib/export has no business holding wording. */
  readonly phrase: (
    key: string,
    params?: Readonly<Record<string, string | number>>,
  ) => string;
  readonly labels: ReportLabels;
};

export type ReportDocument = {
  readonly docId: string;
  readonly name: string;
  readonly counts: Counts;
  readonly text?: string;
  readonly pages?: readonly PageSpan[];
  readonly issues: readonly PlacedIssue[];
  /** The keys of the findings the person marked as dealt with. */
  readonly fixed: ReadonlySet<string>;
};

export type ReportLabels = {
  readonly severity: Readonly<Record<Severity, string>>;
  readonly module: (module: string) => string;
  readonly line: string;
  readonly page: string;
  readonly quote: string;
  readonly fixed: string;
  readonly counts: (counts: Counts) => string;
  readonly nothing: string;
};

/**
 * The line an offset falls on. Computed here from the text the browser holds:
 * line numbers do not travel over the wire in either direction (§10).
 */
export function lineOf(text: string, offset: number): number {
  let line = 1;
  const upTo = [...text].slice(0, offset).join("");
  for (const character of upTo) if (character === "\n") line += 1;
  return line;
}

export function pageOf(
  pages: readonly PageSpan[] | undefined,
  offset: number,
): number | null {
  if (pages === undefined) return null;
  const span = pages.find((page) => offset >= page.from && offset < page.to);
  return span?.page ?? null;
}

function offsetOf(anchor: Anchor): number | null {
  if (anchor.kind === "range") return anchor.from;
  if (anchor.kind === "point") return anchor.at;
  return null;
}

function quoteOf(anchor: Anchor): string | null {
  if (anchor.kind === "range" || anchor.kind === "quote") return anchor.quote;
  if (anchor.kind === "bibkey") return anchor.bibkey;
  return null;
}

/** A quote goes into the report as a blockquote, one line, whatever it contained. */
function asQuote(text: string): string {
  return `> ${text.replace(/\r?\n/g, " ").trim()}`;
}

export function buildIssueReport(input: ReportInput): string {
  const lines: string[] = [`# ${input.title}`, "", input.generatedAt, ""];

  for (const document of input.documents) {
    lines.push(`## ${document.name}`, "", input.labels.counts(document.counts), "");

    if (document.issues.length === 0) {
      lines.push(input.labels.nothing, "");
      continue;
    }

    let heading: string | null = null;
    for (const placed of document.issues) {
      if (placed.module !== heading) {
        heading = placed.module;
        lines.push(`### ${input.labels.module(heading)}`, "");
      }

      const { issue } = placed;
      const marked = document.fixed.has(
        `${placed.docId}:${placed.module}:${issue.issueId}`,
      );
      const severity = input.labels.severity[issue.severity];
      const title = input.phrase(issue.titleKey, issue.params);
      lines.push(
        `- **${severity}** — ${title}${marked ? ` _(${input.labels.fixed})_` : ""}`,
      );

      for (const anchor of issue.anchors) {
        const offset = offsetOf(anchor);
        const place: string[] = [];
        if (offset !== null && document.text !== undefined) {
          place.push(`${input.labels.line} ${lineOf(document.text, offset)}`);
          const page = pageOf(document.pages, offset);
          if (page !== null) place.push(`${input.labels.page} ${page}`);
        }
        if (place.length > 0) lines.push(`  - ${place.join(" · ")}`);

        const quote = quoteOf(anchor);
        if (quote !== null && quote !== "") lines.push(`  ${asQuote(quote)}`);
      }

      if (issue.detail !== undefined && issue.detail !== "") {
        lines.push(`  - ${issue.detail.replace(/\r?\n/g, " ")}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
