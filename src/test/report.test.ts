import { describe, expect, it } from "vitest";

import { toModuleResult } from "@/lib/api/mappers";
import { zModuleResult } from "@/lib/api/wire/zod.gen";
import { buildIssueReport, lineOf, pageOf, type ReportLabels } from "@/lib/export";
import { issuesOf } from "@/lib/normalize";

import { scenarios } from "./msw/handlers.gen";

/**
 * The findings report (M1.10.2). In this first section it is the main thing the
 * product produces: a person takes it into their own editor and fixes the
 * manuscript there, so what is in it decides whether the run was worth making.
 */
const labels: ReportLabels = {
  severity: { critical: "Critical", warning: "Warning", info: "Note" },
  module: (moduleId) => moduleId.toUpperCase(),
  line: "line",
  page: "page",
  quote: "quote",
  fixed: "marked fixed",
  counts: (counts) => `${counts.critical} critical, ${counts.warning} warnings`,
  nothing: "Nothing was found.",
};

const result = toModuleResult(
  zModuleResult.parse(scenarios.getModuleResult.bibcheck.body),
);
const text = `line one\nline two\n${"x".repeat(12_100)}`;

function report(fixed: ReadonlySet<string> = new Set()): string {
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
        pages: [{ page: 7, from: 12_000, to: 13_000 }],
        issues: issuesOf(result),
        fixed,
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
    expect(report()).toContain("bibcheck.retracted_entry");
  });

  it("gives the line and the page of a finding with coordinates", () => {
    // Both are computed in the browser from the text it holds: line numbers do
    // not travel over the wire in either direction (§10).
    const markdown = report();
    expect(markdown).toMatch(/line \d+ · page 7/);
  });

  it("quotes the place verbatim", () => {
    expect(report()).toContain("> Smith et al. [22]");
  });

  it("carries the marks the person made, since they leave with the job", () => {
    const key = `${result.docId}:bibcheck:iss_1`;
    expect(report(new Set([key]))).toContain("_(marked fixed)_");
    expect(report()).not.toContain("_(marked fixed)_");
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
        },
      ],
    });
    expect(markdown).toContain("Nothing was found.");
  });
});

describe("the place is worked out in code points", () => {
  it("a line number counts newlines before the offset", () => {
    expect(lineOf("a\nb\nc", 0)).toBe(1);
    expect(lineOf("a\nb\nc", 2)).toBe(2);
    expect(lineOf("a\nb\nc", 4)).toBe(3);
  });

  it("an astral character before the offset does not shift the line", () => {
    // Counted in code points, as everything about text in this product is: with
    // UTF-16 units the surrogate pair would push the line over by one.
    expect(lineOf("𝄞\nb", 2)).toBe(2);
  });

  it("a page is the span the offset falls inside, and nothing outside it", () => {
    const pages = [
      { page: 1, from: 0, to: 100 },
      { page: 2, from: 100, to: 200 },
    ];
    expect(pageOf(pages, 0)).toBe(1);
    expect(pageOf(pages, 100)).toBe(2);
    expect(pageOf(pages, 500)).toBeNull();
    expect(pageOf(undefined, 5)).toBeNull();
  });
});
