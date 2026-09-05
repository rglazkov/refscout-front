import { describe, expect, it } from "vitest";

import { toModuleResult } from "@/lib/api/mappers";
import { zModuleResult } from "@/lib/api/wire/zod.gen";
import { lineAt, lineOf, lineStarts, pageOf } from "@/lib/docs";
import { toDocOffset } from "@/lib/anchor";
import { asDocOffset, type Place } from "@/lib/domain";
import { buildIssueReport, type ReportIssue, type ReportLabels } from "@/lib/export";
import { issuesOf } from "@/lib/normalize";

import { scenarios } from "./msw/handlers.gen";

/**
 * The findings report. In this first section it is the main thing the product
 * produces: a person takes it into their own editor and fixes the manuscript
 * there, so what is in it decides whether the run was worth making.
 */
const labels: ReportLabels = {
  severity: { critical: "Critical", warning: "Warning", info: "Note" },
  module: (moduleId) => moduleId.toUpperCase(),
  line: "line",
  page: "page",
  quote: "quote",
  fixed: "marked fixed",
  ignored: "turned down",
  replacement: "Proposed replacement:",
  unanchored: "This check read a different version.",
  editedAfterRun: "This document was corrected after the checks read it.",
  edited: "fragment edited since",
  lost: "place not found",
  counts: (counts) => `${counts.critical} critical, ${counts.warning} warnings`,
  nothing: "Nothing was found.",
};

/**
 * The places as the resolver would hand them over: the coordinates of the
 * example body, taken as found. The report is what is under test here, so the
 * resolving is stood in for rather than run - what matters is that the numbers
 * in the file come from a resolved place and not from the wire.
 */
function placed(): readonly ReportIssue[] {
  return issuesOf(result).map((entry) => ({
    ...entry,
    places: entry.issue.anchors.map((anchor): Place =>
      anchor.kind === "range"
        ? {
            status: "exact",
            docId: result.docId,
            // Through the conversion rather than around it, even here: the
            // fixture is ASCII, so the two units agree, and the test says which
            // one the report is given.
            anchor: toDocOffset(null, anchor.from),
            range: {
              from: toDocOffset(null, anchor.from),
              to: toDocOffset(null, anchor.to),
            },
            quote: anchor.quote,
          }
        : anchor.kind === "bibkey"
          ? { status: "derived", docId: result.docId, bibkey: anchor.bibkey }
          : { status: "none", docId: result.docId },
    ),
  }));
}

const result = toModuleResult(
  zModuleResult.parse(scenarios.getModuleResult.bibcheck.body),
);
const text = `line one\nline two\n${"x".repeat(12_100)}`;

function report(
  marks: {
    readonly fixed?: ReadonlySet<string>;
    readonly ignored?: ReadonlySet<string>;
    readonly unanchored?: ReadonlySet<string>;
  } = {},
): string {
  return buildIssueReport({
    title: "Findings",
    generatedAt: "Produced today",
    phrase: (key) => key,
    labels,
    documents: [
      {
        docId: result.docId,
        name: "paper.tex",
        counts: { critical: 1, warning: 1, info: 0 },
        text,
        pages: [{ page: 7, from: asDocOffset(12_000), to: asDocOffset(13_000) }],
        issues: placed(),
        fixed: marks.fixed ?? new Set(),
        ignored: marks.ignored ?? new Set(),
        ...(marks.unanchored === undefined ? {} : { unanchored: marks.unanchored }),
      },
    ],
  });
}

describe("the report says where each finding is", () => {
  it("names the document, the check and the severity", () => {
    const markdown = report();
    expect(markdown).toContain("## paper.tex");
    expect(markdown).toContain("### BIBCHECK");
    expect(markdown).toContain("**Critical**");
  });

  it("carries the wording key through the dictionary rather than a phrase of its own", () => {
    // Escaped, because the file is Markdown and an underscore in the middle of
    // a word opens emphasis in it.
    expect(report()).toContain(String.raw`bibcheck.retracted\_entry`);
  });

  it("gives the line and the page of a finding with coordinates", () => {
    // Both are computed in the browser from the text it holds: line numbers do
    // not travel over the wire in either direction.
    const markdown = report();
    expect(markdown).toMatch(/line \d+ · page 7/);
  });

  it("quotes the place verbatim, with the markup characters in it made literal", () => {
    // The brackets of a citation are what Markdown makes a link out of, so they
    // are escaped: what the reader opens is the sentence as it stands in the
    // manuscript rather than a link built out of it.
    expect(report()).toContain(String.raw`> Smith et al. \[22\]`);
  });

  it("carries the marks the person made, since they leave with the job", () => {
    const key = `${result.docId}:bibcheck:iss_1`;
    expect(report({ fixed: new Set([key]) })).toContain("_(marked fixed)_");
    expect(report({ ignored: new Set([key]) })).toContain("_(turned down)_");
    expect(report()).not.toContain("_(marked fixed)_");
  });

  it("a check that read another version of the text loses its numbers, not its findings", () => {
    // The findings are what the person paid for and they all stay; what goes
    // is the line and the page, because those were worked out from coordinates
    // counted over a text that is not the one in the browser.
    const markdown = report({ unanchored: new Set(["bibcheck"]) });
    expect(markdown).toContain(String.raw`bibcheck.retracted\_entry`);
    expect(markdown).toContain("This check read a different version.");
    expect(markdown).not.toMatch(/line \d+ · page 7/);
  });

  it("a document with nothing found says so rather than being left blank", () => {
    const markdown = buildIssueReport({
      title: "Findings",
      generatedAt: "Produced today",
      phrase: (key) => key,
      labels,
      documents: [
        {
          docId: "d",
          name: "clean.bib",
          counts: { critical: 0, warning: 0, info: 0 },
          issues: [],
          fixed: new Set(),
          ignored: new Set(),
        },
      ],
    });
    expect(markdown).toContain("Nothing was found.");
  });
});

describe("the place is worked out in the units the editor counts in", () => {
  it("a line number counts newlines before the offset", () => {
    expect(lineOf("a\nb\nc", asDocOffset(0))).toBe(1);
    expect(lineOf("a\nb\nc", asDocOffset(2))).toBe(2);
    expect(lineOf("a\nb\nc", asDocOffset(4))).toBe(3);
  });

  it("an astral character takes the two units a string holds it in", () => {
    /*
     * The map and the offsets given to it are both in the browser's own units,
     * so the surrogate pair takes two of them and the line after it begins at
     * three. Conversion out of the unit the wire counts in happens once, before
     * any of this, and nothing below that point knows the other unit exists -
     * which is the whole reason a line number said here is the line number the
     * person can count to in their editor.
     */
    const text = "𝄞\nb";
    expect(lineOf(text, asDocOffset(1))).toBe(1);
    expect(lineOf(text, asDocOffset(3))).toBe(2);
  });

  it("a page is the span the offset falls inside, and nothing outside it", () => {
    const pages = [
      { page: 1, from: asDocOffset(0), to: asDocOffset(100) },
      { page: 2, from: asDocOffset(100), to: asDocOffset(200) },
    ];
    expect(pageOf(pages, asDocOffset(0))).toBe(1);
    expect(pageOf(pages, asDocOffset(100))).toBe(2);
    expect(pageOf(pages, asDocOffset(500))).toBeNull();
    expect(pageOf(undefined, asDocOffset(5))).toBeNull();
  });

  it("the index answers the same line the whole text does", () => {
    const text = "one\n𝄞two\n\nthree";
    const starts = lineStarts(text);
    for (let offset = 0; offset <= text.length; offset += 1) {
      expect(lineAt(starts, asDocOffset(offset))).toBe(lineOf(text, asDocOffset(offset)));
    }
  });
});
