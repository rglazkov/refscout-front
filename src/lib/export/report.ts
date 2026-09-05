import { lineAt, lineStarts, pageOf } from "@/lib/docs";
import {
  isResolved,
  type Counts,
  type Issue,
  type ModuleId,
  type PageSpan,
  type Place,
  type Severity,
} from "@/lib/domain";

/**
 * The findings report in Markdown. In this first section it is the main thing
 * the product produces: a person takes it into their own editor and fixes the
 * manuscript there.
 *
 * The assembler is our own rather than a Markdown library's: what is needed is
 * a handful of headings and lists. The text inside them is someone else's - a
 * sentence out of a manuscript, a name off somebody's disk - so every character
 * that would mark it up is escaped on the way in, and what the reader opens is
 * their own words rather than our syntax made out of them.
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

/**
 * One finding as the report needs it: what it says, and where it ended up on
 * the text the browser holds. The places are the resolver's answer rather than
 * the module's offsets, so a line number in the report is a line the reader can
 * count to in the file they downloaded beside it.
 */
export type ReportIssue = {
  readonly docId: string;
  readonly module: ModuleId;
  readonly issue: Issue;
  readonly places: readonly Place[];
};

export type ReportDocument = {
  readonly docId: string;
  readonly name: string;
  readonly counts: Counts;
  readonly text?: string;
  readonly pages?: readonly PageSpan[];
  /**
   * The text was corrected after the checks read it. The numbers below then
   * describe where things were at the moment of the check, and the reader is
   * told so once, under the name of the document: a line number that has
   * quietly moved is worse than no line number, because it looks exactly like
   * one that is right.
   */
  readonly editedAfterRun?: boolean;
  readonly issues: readonly ReportIssue[];
  /** The keys of the findings the person marked as dealt with. */
  readonly fixed: ReadonlySet<string>;
  /** The keys of the findings the person turned down. */
  readonly ignored: ReadonlySet<string>;
  /**
   * The modules whose bodies were counted over a different text than the one
   * the browser holds. Their findings keep their place in the report and lose
   * their line and page numbers: a number worked out from coordinates for
   * another version of the document would send the reader to the wrong line
   * with every appearance of precision.
   */
  readonly unanchored?: ReadonlySet<string>;
};

export type ReportLabels = {
  readonly severity: Readonly<Record<Severity, string>>;
  readonly module: (module: string) => string;
  readonly line: string;
  readonly page: string;
  readonly quote: string;
  readonly fixed: string;
  readonly ignored: string;
  /** Introduces the replacement a module proposed for a place. */
  readonly replacement: string;
  /** Says that a check read a different version of this document. */
  readonly unanchored: string;
  /** Says that the text was corrected after the checks read it. */
  readonly editedAfterRun: string;
  /** Says that this particular fragment has been edited since. */
  readonly edited: string;
  /** Says that the place would not resolve at all. */
  readonly lost: string;
  readonly counts: (counts: Counts) => string;
  readonly nothing: string;
};

/**
 * What a module offers to put in place of what is there. It is written into the
 * report because the report is what a person works from: they are in their own
 * editor with the manuscript open, and the replacement beside the finding is
 * the difference between reading about a problem and fixing it.
 */
function replacementOf(issue: Issue): string | null {
  const action = issue.actions.find((candidate) => candidate.kind === "replace");
  return action === undefined ? null : action.value;
}

function quoteOf(place: Place): string | null {
  return place.quote ?? place.bibkey ?? null;
}

/**
 * Somebody else's text, made safe to put in a Markdown file.
 *
 * The report is Markdown, and Markdown is interpreted by whatever opens it. A
 * sentence out of a manuscript is full of the characters that mark it up -
 * underscores in an identifier, asterisks around a footnote marker, a hash at
 * the start of a heading being quoted, the brackets and parentheses of a
 * citation - and left as they are, the reader is shown emphasis, headings and
 * links that are not in their document. Worse, the characters themselves
 * disappear, and several of the checks are about exactly those characters.
 *
 * So every character Markdown gives a meaning to is escaped. What the reader
 * sees is then the manuscript's own text, character for character.
 */
function asMarkdown(text: string): string {
  const inline = text.replace(/[\\`*_[\]<>~|]/g, (character) => `\\${character}`);
  /*
   * The rest only mark up a block, and only where a line begins - which is
   * where every piece of somebody else's text in this file is put. A hyphen at
   * the head of a quoted line would otherwise open a list, and a number
   * followed by a full stop would open a numbered one starting at that number.
   */
  return inline
    .replace(/^(\s*)([#>+-])/, "$1\\$2")
    .replace(/^(\s*)(\d+)([.)])/, "$1$2\\$3");
}

/**
 * A quote goes into the report as a blockquote, one line, whatever it
 * contained: a line break inside one would end the quote and continue as
 * ordinary prose.
 */
function asQuote(text: string): string {
  return `> ${asMarkdown(text.replace(/\r?\n/g, " ").trim())}`;
}

export function buildIssueReport(input: ReportInput): string {
  const lines: string[] = [`# ${input.title}`, "", input.generatedAt, ""];

  for (const document of input.documents) {
    lines.push(
      `## ${asMarkdown(document.name)}`,
      "",
      input.labels.counts(document.counts),
      "",
    );

    /*
     * Said once, at the top of the document it is about. Somebody who corrected
     * their manuscript and then took the report away has a file in one hand and
     * a set of line numbers in the other, and the two describe different
     * moments; that is worth a sentence, and it is worth it before the numbers
     * rather than after them.
     */
    if (document.editedAfterRun === true) {
      lines.push(`_${input.labels.editedAfterRun}_`, "");
    }

    if (document.issues.length === 0) {
      lines.push(input.labels.nothing, "");
      continue;
    }

    // One pass over the text for the whole document, however many findings
    // point into it.
    const starts = document.text === undefined ? undefined : lineStarts(document.text);

    let heading: string | null = null;
    /** The modules whose warning about a moved text has already been written. */
    const said = new Set<string>();
    for (const placed of document.issues) {
      if (placed.module !== heading) {
        heading = placed.module;
        lines.push(`### ${input.labels.module(heading)}`, "");
      }

      const { issue } = placed;
      const key = `${placed.docId}:${placed.module}:${issue.issueId}`;
      const mark = document.fixed.has(key)
        ? ` _(${input.labels.fixed})_`
        : document.ignored.has(key)
          ? ` _(${input.labels.ignored})_`
          : "";
      const severity = input.labels.severity[issue.severity];
      const title = input.phrase(issue.titleKey, issue.params);
      lines.push(`- **${severity}** — ${asMarkdown(title)}${mark}`);

      /*
       * A body counted over another text keeps its findings here and loses its
       * numbers: the reader is told once, under the first finding of that
       * check, rather than being sent to a line that has moved.
       */
      const anchored = document.unanchored?.has(placed.module) !== true;
      if (!anchored && !said.has(placed.module)) {
        said.add(placed.module);
        lines.push(`  - _${input.labels.unanchored}_`);
      }

      for (const resolved of placed.places) {
        const offset =
          anchored && isResolved(resolved) && resolved.edited !== true
            ? (resolved.anchor ?? null)
            : null;
        const place: string[] = [];
        if (offset !== null && starts !== undefined) {
          place.push(`${input.labels.line} ${lineAt(starts, offset)}`);
          const page = pageOf(document.pages, offset);
          if (page !== null) place.push(`${input.labels.page} ${page}`);
        }
        /*
         * A place that could not be worked out, and one whose text has been
         * corrected since, are both said in words rather than left as a finding
         * with nothing beside it. The reader can tell the difference between
         * "we could not find this" and "you have already changed this", and
         * they mean different things about what to do next.
         */
        if (anchored && resolved.edited === true) place.push(input.labels.edited);
        else if (anchored && resolved.status === "lost") place.push(input.labels.lost);
        if (place.length > 0) lines.push(`  - ${place.join(" · ")}`);

        const quote = quoteOf(resolved);
        if (quote !== null && quote !== "") lines.push(`  ${asQuote(quote)}`);
      }

      if (issue.detail !== undefined && issue.detail !== "") {
        lines.push(`  - ${asMarkdown(issue.detail.replace(/\r?\n/g, " "))}`);
      }
      const replacement = replacementOf(issue);
      if (replacement !== null && replacement !== "") {
        lines.push(`  - ${input.labels.replacement}`, `  ${asQuote(replacement)}`);
      }
      lines.push("");
    }
  }

  return `${lines.join("\n").trimEnd()}\n`;
}
