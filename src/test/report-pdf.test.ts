import { readFileSync } from "node:fs";

import fontkit from "@pdf-lib/fontkit";
import { unzlibSync } from "fflate";
import { PDFDocument, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { type Counts, type Severity } from "@/lib/domain";
import { renderReportPdf, type FaceBytes, type Role } from "@/lib/export/pdf";
import {
  type ReportDoc,
  type ReportFinding,
  type ReportPlace,
  type ReportSection,
} from "@/lib/export/report";

/**
 * The report as the person actually receives it: a PDF, written here from the
 * same faces the worker builds in and read back with the same library the
 * product parses PDFs with.
 *
 * Reading it back is the whole point. A writer that produced a file at all
 * would pass any assertion about its length, and the two things that matter
 * about this file cannot be seen from the outside: that a fragment of somebody
 * else's manuscript comes out of it character for character, and that a report
 * long enough to be worth having is paginated instead of drawn off the bottom
 * of page one.
 *
 * Which file sets which role is read out of the worker's own import list rather
 * than copied. A second list here would be a list that goes stale, and it would
 * go stale silently: the faces would still draw, and only the look of the
 * report would quietly stop being the one under test.
 */
const FACE_IMPORT = /import (\w+) from "[^"]*(\/fonts\/pdf\/[^"]+\.ttf)"/g;

const faces = [
  ...readFileSync("src/workers/report.worker.ts", "utf8").matchAll(FACE_IMPORT),
].map((match) => [match[1] as Role, `public${match[2] ?? ""}`] as const);

const fonts: FaceBytes = Object.fromEntries(
  faces.map(([role, file]) => [role, new Uint8Array(readFileSync(file))]),
) as FaceBytes;

const wording = {
  pageNumbers: "page {page} of {total}",
  severity: { critical: "Critical", warning: "Warning", info: "Note" },
} as const;

function place(quote: string | null): ReportPlace {
  return {
    where: [
      { label: "line", value: "42" },
      { label: "page", value: "7" },
    ],
    quote,
    bibkey: null,
  };
}

function finding(
  title: string,
  quote: string | null,
  severity: Severity = "critical",
): ReportFinding {
  return {
    severity,
    severityLabel: wording.severity[severity],
    title,
    mark: null,
    places: [place(quote)],
    detail: null,
    facts: [],
    replacement: null,
  };
}

function section(name: string, findings: readonly ReportFinding[]): ReportSection {
  const counts: Counts = { critical: findings.length, warning: 0, info: 0 };
  return {
    name,
    counts,
    notes: [],
    nothing: null,
    checks: [{ name: "BIBCHECK", note: null, findings }],
  };
}

function doc(documents: readonly ReportSection[]): ReportDoc {
  return { title: "Findings", generatedAt: "Produced today", documents };
}

async function write(report: ReportDoc): Promise<Uint8Array> {
  return renderReportPdf({ doc: report, fonts, wording, producer: "Test" });
}

/** The text of the whole file, page by page, as a reader would copy it out. */
async function readBack(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const file = await getDocument({
    // A copy, because the reader takes the buffer over and the caller may still
    // want to look at what it wrote.
    data: new Uint8Array(bytes),
    useSystemFonts: false,
  }).promise;
  const parts: string[] = [];
  for (let number = 1; number <= file.numPages; number += 1) {
    const page = await file.getPage(number);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if ("str" in item) parts.push(item.str);
    }
  }
  return { pages: file.numPages, text: parts.join("\n") };
}

/**
 * The font programs the file carries, taken back out of it.
 *
 * A PDF holds each face as a stream of its own, and this is the only way to ask
 * the question that matters about them: not whether the text is right - it can
 * be perfectly right - but whether the shapes the reader will draw it with are
 * there at all.
 */
async function facesInside(bytes: Uint8Array): Promise<readonly Uint8Array[]> {
  const file = await PDFDocument.load(bytes);
  const programs: Uint8Array[] = [];
  for (const [, object] of file.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    let content: Uint8Array;
    try {
      content = unzlibSync(object.contents);
    } catch {
      continue;
    }
    /*
     * Recognised by what it is rather than by anything the file says about it:
     * the four bytes a TrueType file begins with. The streams around it are
     * page content and character maps, and none of them starts that way.
     */
    const magic = new DataView(content.buffer, content.byteOffset).getUint32(0);
    if (magic === 0x0001_0000) programs.push(content);
  }
  return programs;
}

describe("the report comes out as a PDF somebody can read", () => {
  it("is set in the four faces the worker was given", () => {
    // Without this the list above could match nothing and every case below
    // would be testing a report with no faces in it at all.
    expect(faces.map(([role]) => role).sort()).toEqual(["bold", "mono", "sans", "serif"]);
  });

  it("writes a file the format's own readers accept", async () => {
    const bytes = await write(
      doc([section("paper.tex", [finding("A retracted entry", null)])]),
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const { pages, text } = await readBack(bytes);
    expect(pages).toBe(1);
    expect(text).toContain("Findings");
    expect(text).toContain("paper.tex");
    expect(text).toContain("A retracted entry");
  });

  it("keeps a quoted fragment character for character", async () => {
    /*
     * The characters below are the ones a format with markup would have eaten -
     * brackets, an asterisk, an underscore - and several of the checks in this
     * product are about exactly those. They are drawn as themselves, so they
     * come back out as themselves.
     */
    const quote = "Smith et al. [22] said *nothing* about file_name";
    const { text } = await readBack(
      await write(doc([section("paper.tex", [finding("Cited work", quote)])])),
    );
    expect(text).toContain(quote);
  });

  it("sets a manuscript that is not in Latin", async () => {
    // The faces the report embeds cover the scripts the product's own faces
    // cover, and a quotation in one of them has to survive the round trip whole.
    const quote = "Проверка ссылок — Ελληνικά — Łódź";
    const { text } = await readBack(
      await write(doc([section("диссертация.docx", [finding("Ссылка", quote)])])),
    );
    expect(text).toContain(quote);
    expect(text).toContain("диссертация.docx");
  });

  it("gives every document a page of its own and numbers them all", async () => {
    const bytes = await write(
      doc([
        section("one.tex", [finding("First", null)]),
        section("two.tex", [finding("Second", null)]),
        section("three.tex", [finding("Third", null)]),
      ]),
    );
    const { pages, text } = await readBack(bytes);
    // Three documents and the contents that name them: four pages.
    expect(pages).toBe(4);
    /*
     * Loosely, because the foot is drawn in two faces - the words in the text
     * face and the numbers in the mono one - and a reader hands back a piece
     * per face. What is being asserted is that the sentence is there and reads
     * in the right order, not how many pieces it arrived in.
     */
    expect(text.replace(/\s+/g, " ")).toContain("page 4 of 4");
  });

  it("says on every page which document it belongs to", async () => {
    /*
     * The head of a document is four pages back by the time somebody is reading
     * the middle of it, so the name is repeated above the text of every page
     * after the one it opens on. Without it a report of any length answers
     * "which manuscript is this about" only by scrolling back.
     */
    const many = Array.from({ length: 30 }, (_unused, index) =>
      finding(`Finding number ${index + 1}`, "A quoted sentence from the manuscript."),
    );
    const bytes = await write(doc([section("thesis.tex", many)]));
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const file = await getDocument({ data: new Uint8Array(bytes) }).promise;
    expect(file.numPages).toBeGreaterThan(2);

    for (let number = 2; number <= file.numPages; number += 1) {
      const page = await file.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      expect([number, text.includes("thesis.tex")]).toEqual([number, true]);
    }
  });

  it("carries an index the reader can open down its own side", async () => {
    /*
     * The outline is what a PDF reader shows in its sidebar, and it is the one
     * way around a long report that costs the page nothing. It is built by
     * hand, so what is checked is that it is really there and really names the
     * documents and their checks.
     */
    const bytes = await write(
      doc([
        section("диссертация.tex", [finding("First", null)]),
        section("appendix.docx", [finding("Second", null)]),
      ]),
    );
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const file = await getDocument({ data: new Uint8Array(bytes) }).promise;
    // The reader describes an outline loosely, so the shape being read out of
    // it is named here rather than trusted.
    const outline = (await file.getOutline()) as
      | readonly {
          readonly title: string;
          readonly items: readonly { title: string }[];
        }[]
      | null;

    expect(outline?.map((item) => item.title)).toEqual([
      "диссертация.tex",
      "appendix.docx",
    ]);
    expect(outline?.[0]?.items.map((item) => item.title)).toEqual(["BIBCHECK"]);
  });

  it("breaks a fragment far too long for one line instead of drawing it off the page", async () => {
    // No spaces anywhere in it: a URL, an identifier, or a language that does
    // not separate its words. It has to be cut where it has to be cut.
    const quote = "x".repeat(4000);
    const { pages } = await readBack(
      await write(doc([section("long.tex", [finding("Long", quote)])])),
    );
    expect(pages).toBeGreaterThan(1);
  });

  it("carries a job the size of a thesis without dropping any of it", async () => {
    /*
     * Findings are never capped in this product, so the writer has to hold a
     * result nobody would want to read in one sitting. Three thousand of them,
     * with a quotation each, is the shape of a check over a dissertation.
     */
    const many = Array.from({ length: 3000 }, (_unused, index) =>
      finding(
        `Finding number ${index + 1}`,
        `A quoted sentence from the manuscript, number ${index + 1}, long enough to wrap onto a second line of the measure.`,
        index % 3 === 0 ? "critical" : index % 3 === 1 ? "warning" : "info",
      ),
    );
    const bytes = await write(doc([section("thesis.tex", many)]));
    const { pages, text } = await readBack(bytes);
    expect(pages).toBeGreaterThan(100);
    expect(text).toContain("Finding number 1");
    expect(text).toContain("Finding number 3000");
  }, 120_000);

  it("carries faces that can actually draw the letters, not only name them", async () => {
    /*
     * The defect this exists for is the worst kind there is here: a file that
     * opens, whose text is correct, which searches and copies correctly, and
     * which is missing half its letters when a person looks at it. It comes
     * from cutting an embedded face down to the characters used, which is why
     * the writer does not do that - and nothing about the text of the file
     * would ever say so. So the faces are taken back out of the file and asked
     * for the outlines themselves.
     */
    const bytes = await write(
      doc([
        section("paper.tex", [finding("The quick brown fox jumps", "Проверка ссылок")]),
      ]),
    );
    const programs = await facesInside(bytes);
    expect(programs).toHaveLength(4);

    for (const program of programs) {
      // The reader ships no types for the one thing being asked here - the
      // outline of a glyph - so the shape of that answer is named.
      const font = fontkit.create(program) as unknown as {
        readonly glyphsForString: (
          text: string,
        ) => readonly { readonly path: { readonly commands: readonly unknown[] } }[];
      };
      const blank = [..."Findings 0123"].filter(
        (character) =>
          character !== " " &&
          (font.glyphsForString(character)[0]?.path.commands.length ?? 0) === 0,
      );
      expect(blank).toEqual([]);
    }
  });

  it("sets an identifier as the characters it is made of", async () => {
    /*
     * A report is full of things that are not prose - an address, a DOI, a
     * bibliography key - and they are set in the mono face, which is the one
     * face here with opinions about them: left to itself it draws `://` and
     * `!=` as single joined shapes. That is wrong twice over. The reader would
     * be shown characters their document does not contain, and the writer
     * cannot read the metrics of those joined shapes at all - it throws while
     * saving, and the person who asked for a report gets no file.
     */
    const address = "https://x.org/1 != 2";
    const one = finding("An address that would be drawn as arrows", null);
    const bytes = await write(
      doc([
        section("paper.tex", [{ ...one, facts: [{ label: "Address", value: address }] }]),
      ]),
    );
    const { text } = await readBack(bytes);
    expect(text).toContain(address);
  });

  it("draws a character no embedded face has rather than leaving a hole", async () => {
    /*
     * The faces cover Latin, Cyrillic, Greek and Vietnamese; a manuscript in
     * another script is not refused, and what it produces is a visible box per
     * character. A reader who can see that something did not come out is in a
     * better position than one looking at a gap where a word was.
     */
    const { text } = await readBack(
      await write(doc([section("cjk.docx", [finding("Reference", "中文文献")])])),
    );
    expect(text).toContain("□□□□");
  });
});
