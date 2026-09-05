import { describe, expect, it } from "vitest";

import { fromBytes } from "@/lib/docs/canonical";
import { limits } from "@/lib/docs/limits";
import { countCodePoints } from "@/lib/docs/units";
import { assess } from "@/lib/parse/quality";
import { parseDocx } from "@/lib/parse/docx";
import { openContainer } from "@/lib/parse/zip";
import { parsePdf } from "@/lib/parse/pdf";
import { parseText } from "@/lib/parse/text";

import {
  AWKWARD_BIB,
  HOSTILE_BIB,
  NESTED_MARKDOWN,
  TEX_WITH_INPUT,
  buildCrowdedDocx,
  buildDocx,
  buildPdf,
  buildZipBomb,
  claimEntrySize,
  cjkFontObjects,
  bullet,
  corruptPdfBytes,
  cp1251Bytes,
  paragraph,
  scanPage,
  scanResources,
  table,
  textPage,
  twoColumnPage,
  unicodeFontObjects,
  withFootnote,
} from "./corpus";

/**
 * The corpus, and what is asked of it.
 *
 * What is checked are invariants, never a reference text. A test that compares
 * extraction against a stored string turns red on every pdf.js release over one
 * space that moved; people stop fixing it, and then they turn it off. So the
 * questions here are the ones that stay true across versions: how many pages,
 * roughly how much text, are the phrases we put in still there, what share of
 * it is printable, are there replacement characters, did the metadata come out.
 *
 * For the formats that are already text the invariant is harder and exact: what
 * was read is the file, byte for byte, once the line endings are normalised.
 */
/**
 * No pdf.js resources are handed over in this lane, and that is deliberate.
 * They are fetched by address, a test process has no page to resolve one
 * against, and a fixture that quietly took a path the product never takes
 * would be worse than no fixture. That they are copied and that they make a
 * Chinese document readable is asked in the browser lane instead, in
 * `e2e/shared/manuscripts.spec.ts`.
 */

async function failureOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (cause) {
    return (cause as { code?: string }).code ?? "no-code";
  }
  return "no-failure";
}

describe("PDF", () => {
  it("reads an ordinary paper and maps its pages", async () => {
    const parsed = await parsePdf(
      buildPdf([
        textPage(["Introduction", "We estimate the variance of the estimator."]),
        textPage(["Method", "The sample was dried at 40 degrees."]),
        textPage(["References", "Smith, J. (2019). On the estimation of variance."]),
      ]),
    );

    expect(parsed.pageCount).toBe(3);
    expect(parsed.pagesParsed).toBe(3);
    expect(parsed.extracted.text).toContain("estimate the variance");
    expect(parsed.extracted.text).toContain("Smith, J. (2019)");

    // The map is in the coordinates of the text it lies beside, and that is an
    // invariant rather than a property of a careful implementation: a slice
    // taken by a page's span is that page.
    const spans = parsed.pages ?? [];
    expect(spans).toHaveLength(3);
    expect(parsed.extracted.text.slice(spans[1]?.from, spans[1]?.to)).toContain("Method");
    expect(parsed.extracted.text.slice(spans[2]?.from, spans[2]?.to)).toContain(
      "References",
    );
    for (const span of spans) {
      expect(span.to).toBeLessThanOrEqual(parsed.extracted.text.length);
      expect(span.from).toBeLessThanOrEqual(span.to);
    }
  });

  it("keeps both columns of a two-column layout", async () => {
    const parsed = await parsePdf(
      buildPdf([
        twoColumnPage(
          ["The left column", "carries the argument."],
          ["The right column", "carries the evidence."],
        ),
      ]),
    );
    expect(parsed.extracted.text).toContain("carries the argument.");
    expect(parsed.extracted.text).toContain("carries the evidence.");
  });

  it("keeps ligatures, mathematics and diacritics exactly as the document has them", async () => {
    // Everything here survives NFC and is destroyed by a tidy-up, which is why
    // no tidy-up exists on this path: a ligature tells a text out of a PDF from
    // a typed one, and a narrow space in a number was put there by the author.
    const characters = ["ﬁ", "ﬂ", "σ", "≤", "é", "𝑥", "µ"];
    const font = unicodeFontObjects(characters);
    const parsed = await parsePdf(
      buildPdf([font.page(characters.map((_, index) => index))], {
        extra: [...font.objects],
        resources: font.resources,
      }),
    );

    for (const character of characters) {
      expect(parsed.extracted.text).toContain(character);
    }
  });

  it("maps pages in the units the text is stored in, whatever is on the page before", async () => {
    /*
     * A character above the basic plane is one code point and two units of a
     * JavaScript string, and this map is compared against places that have
     * already been converted into the second of those - so it is measured in
     * the second too. Counted in code points it would fall short of the text by
     * one per such character, and a finding on page two would be reported on
     * page one.
     */
    const font = unicodeFontObjects(["𝄞"]);
    const parsed = await parsePdf(
      buildPdf([font.page([0, 0, 0]), font.page([0])], {
        extra: [...font.objects],
        resources: font.resources,
      }),
    );

    const spans = parsed.pages ?? [];
    expect(spans).toHaveLength(2);
    expect(spans.at(-1)?.to).toBe(parsed.extracted.text.length);
    // And the two units genuinely differ on this document, so the assertion
    // above is not the same statement written twice.
    expect(parsed.extracted.text.length).toBeGreaterThan(
      [...parsed.extracted.text].length,
    );
  });

  it("cannot read Chinese without the copied character maps", () => {
    // Half of the character-map check, and the half a test process can answer.
    // Given no resources, a document whose font names a predefined character
    // map comes out empty - and an empty extraction is reported as a scan, so
    // a perfectly good file would be refused. The other half, that the copied
    // maps make it readable, needs a browser to fetch them and lives in the
    // browser lane, in `e2e/shared/manuscripts.spec.ts`.
    const font = cjkFontObjects("你好世界");
    const bytes = buildPdf([font.page], {
      extra: [...font.objects],
      resources: font.resources,
    });
    return expect(failureOf(parsePdf(bytes))).resolves.toBe("NO_TEXT_LAYER");
  });

  it("reads three hundred pages, reports progress and stays within the budget", async () => {
    const pages = Array.from({ length: 300 }, (_, index) =>
      textPage([`Page ${index + 1}`, "The body of a long dissertation."]),
    );
    const seen: number[] = [];
    const started = Date.now();
    const parsed = await parsePdf(buildPdf(pages), {
      onProgress: ({ done }) => seen.push(done),
    });

    expect(parsed.pageCount).toBe(300);
    expect(seen).toHaveLength(300);
    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(300);
    expect(parsed.extracted.text).toContain("Page 300");
    // Not a benchmark: a ceiling generous enough never to fail on a slow
    // machine and tight enough to catch a change that made extraction
    // quadratic in the number of pages.
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it("stops between pages when the parse is cancelled", async () => {
    const pages = Array.from({ length: 50 }, () => textPage(["A page."]));
    const controller = new AbortController();
    const failed = failureOf(
      parsePdf(buildPdf(pages), {
        signal: controller.signal,
        onProgress: ({ done }) => {
          if (done >= 3) controller.abort();
        },
      }),
    );
    expect(await failed).toBe("CANCELLED");
  });

  it("extracts the metadata as fields of its own", async () => {
    // The one fixture whose author's name is nowhere in the text: PreSubmit
    // reads the properties for exactly this case, and a client that sent the
    // bare text would lose it and still report "all clear".
    const parsed = await parsePdf(
      buildPdf([textPage(["An anonymous submission with no names in the body."])], {
        info: {
          Author: "Jane Smith",
          Title: "On the estimation of variance",
          Producer: "pdfTeX",
          Keywords: "variance; estimation",
        },
      }),
    );

    expect(parsed.meta?.Author).toBe("Jane Smith");
    expect(parsed.meta?.Title).toBe("On the estimation of variance");
    expect(parsed.meta?.Producer).toBe("pdfTeX");
    expect(parsed.extracted.text).not.toContain("Jane Smith");
  });

  it("calls a document with no text layer a scan rather than a failure", async () => {
    const image =
      "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 " +
      "/ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n \nendstream";
    const failed = await failureOf(
      parsePdf(buildPdf([scanPage()], { extra: [image], resources: scanResources })),
    );
    expect(failed).toBe("NO_TEXT_LAYER");
  });

  it("recovers a file whose cross-reference table points nowhere", async () => {
    const parsed = await parsePdf(
      buildPdf([textPage(["The table is broken and the objects are not."])], {
        breakXref: true,
      }),
    );
    expect(parsed.extracted.text).toContain("the objects are not");
  });

  it("refuses a damaged file with a code rather than a crash", async () => {
    expect(await failureOf(parsePdf(corruptPdfBytes()))).toBe("PDF_CORRUPT");
  });

  it("asks for the password of a protected document, and reads it once given", async () => {
    const bytes = buildPdf([textPage(["A protected draft of the thesis."])], {
      password: "opensesame",
    });

    expect(await failureOf(parsePdf(bytes))).toBe("PDF_PASSWORD_REQUIRED");
    expect(await failureOf(parsePdf(bytes, { password: "wrong" }))).toBe(
      "PDF_PASSWORD_WRONG",
    );

    const parsed = await parsePdf(bytes, { password: "opensesame" });
    expect(parsed.extracted.text).toContain("A protected draft");
  });
});

describe("Word", () => {
  it("gives markdown with headings, lists, tables and footnotes", async () => {
    const parsed = await parseDocx(
      buildDocx(
        [
          paragraph("On the estimation of variance", "Heading1"),
          paragraph("Method", "Heading2"),
          bullet("Rinse the sample twice"),
          bullet("Dry it at 40 degrees", 1),
          withFootnote("The estimator is unbiased"),
          table([
            ["Sample", "Mass"],
            ["A", "12 g"],
          ]),
        ].join(""),
      ),
    );

    const markdown = parsed.extracted.text;
    expect(markdown).toContain("# On the estimation of variance");
    expect(markdown).toContain("## Method");
    expect(markdown).toMatch(/[-*]\s+Rinse the sample twice/);
    expect(markdown).toMatch(/\|\s*Sample\s*\|/);
    expect(markdown).toContain("The footnote that proves footnotes survive.");
  });

  it("reports progress and finishes", async () => {
    const seen: number[] = [];
    await parseDocx(buildDocx(paragraph("A short note.")), {
      onProgress: ({ done }) => seen.push(done),
    });
    expect(seen).toEqual([0, 1, 2, 3]);
  });

  it("refuses an archive with more entries than a Word file can have", async () => {
    expect(await failureOf(parseDocx(buildCrowdedDocx(1200)))).toBe(
      "ARCHIVE_TOO_MANY_ENTRIES",
    );
  });

  it("refuses an archive that unpacks far more than it holds", () => {
    // Twenty megabytes of zeroes in a few kilobytes of file: a compression
    // ratio no document has and every zip bomb does.
    return expect(failureOf(parseDocx(buildZipBomb(20 * 1024 * 1024)))).resolves.toBe(
      "ARCHIVE_RATIO_TOO_HIGH",
    );
  });

  it("refuses an entry that claims to unpack past the ceiling", () => {
    // The catalogue's own number, which costs nothing to read and turns the
    // obvious cases away before a byte is inflated. It is not the protection -
    // the byte counter on the inflating stream is - because this number is
    // written by whoever made the archive.
    const archive = claimEntrySize(
      buildDocx(paragraph("A short note.")),
      "word/document.xml",
      200 * 1024 * 1024,
    );
    return expect(failureOf(parseDocx(archive))).resolves.toBe("ARCHIVE_ENTRY_TOO_LARGE");
  });

  it("refuses an archive whose parts add up past the ceiling, and says so", () => {
    // The ceiling on everything unpacked together, met on a small archive: the
    // real one is three hundred megabytes and inflating that inside a test
    // buys the same assertion for a hundred times the memory.
    const archive = buildDocx(paragraph("A short note."));
    let thrown: { code?: string; params?: Record<string, number> } = {};
    try {
      openContainer(archive, { ...limits.archive, maxUnpackedBytes: 64 });
    } catch (cause) {
      thrown = cause as { code?: string; params?: Record<string, number> };
    }

    // The numbers have to belong to the ceiling that was met. Reported as the
    // entry's, they said a small part had passed a limit far above it.
    expect(thrown.code).toBe("ARCHIVE_TOTAL_TOO_LARGE");
    expect(thrown.params?.limit).toBe(64);
    expect(thrown.params?.unpacked).toBeGreaterThan(64);
  });

  it("refuses something that is not a Word file at all", async () => {
    expect(await failureOf(parseDocx(corruptPdfBytes()))).toBe("DOCX_UNREADABLE");
  });

  it("calls a container that held no text empty", async () => {
    expect(await failureOf(parseDocx(buildDocx("")))).toBe("DOCX_EMPTY");
  });
});

describe("the formats that are already text", () => {
  const encoder = new TextEncoder();

  /**
   * The exact invariant, and the one the whole product rests on: what the
   * person gets back is what they brought. Line endings are the single
   * permitted difference, and they are restored when the file is assembled
   * again.
   */
  it.each([
    ["markdown", NESTED_MARKDOWN, "md"] as const,
    ["LaTeX", TEX_WITH_INPUT, "tex"] as const,
    ["BibTeX", AWKWARD_BIB, "bib"] as const,
    ["a hostile BibTeX field", HOSTILE_BIB, "bib"] as const,
  ])("reads %s byte for byte", (_name, source, format) => {
    const parsed = parseText(encoder.encode(source), format);
    expect(parsed.extracted.text).toBe(source);
    expect(assess(parsed.extracted.text).suspicious).toBe(false);
  });

  it("keeps the escaping and the braces a bibliography is made of", () => {
    const parsed = parseText(encoder.encode(AWKWARD_BIB), "bib");
    expect(parsed.extracted.text).toContain("@string{jmlr");
    expect(parsed.extracted.text).toContain("O'Neill, S{\\'e}an");
    // Both entries under the same key are still there. Finding the duplicate is
    // the check's job, and losing one of them would make it impossible.
    expect(parsed.extracted.text.match(/@article\{smith2019/g)).toHaveLength(2);
  });

  it("reads a file that is not UTF-8 without pretending it succeeded", () => {
    /*
     * There is one encoding in this product and it is UTF-8, for `.txt` as for
     * everything else: nothing tracks what the bytes were written in and
     * nothing varies by it. A file that is not UTF-8 is decoded as best it can
     * be, and what the person sees on the card and in the editor is what will
     * be checked - which is the point of being able to read it before the
     * run.
     */
    const parsed = parseText(cp1251Bytes(), "txt");
    expect(parsed.extracted.eol).toBe("\r\n");
    expect(parsed.extracted.text).not.toContain("\r");
    // And the way out of a text that came out wrong is the one every other
    // damaged text gets: open it, or save the file again as UTF-8.
    expect(parsed.extracted.text).not.toContain("Требования");
  });

  it("normalises line endings and remembers which they were", () => {
    const parsed = parseText(encoder.encode("one\r\ntwo\r\n"), "txt");
    expect(parsed.extracted.text).toBe("one\ntwo\n");
    expect(parsed.extracted.eol).toBe("\r\n");
  });

  it("keeps the characters a tidy-up would take out", () => {
    // A narrow space inside a number, a soft hyphen, a non-breaking space and a
    // zero-width joiner. Each looks like something worth cleaning up and each
    // carries meaning - the first two were put there by the author, and a check
    // that hunts for them finds nothing once a normaliser has been past.
    const fussy = "1 000 kg soft­hyphen zero‍width";
    const parsed = parseText(encoder.encode(fussy), "txt");
    expect(parsed.extracted.text).toBe(fussy);
  });

  it("counts in code points, not in UTF-16 units", () => {
    const parsed = parseText(encoder.encode("𝑥 = 1"), "txt");
    expect(countCodePoints(parsed.extracted.text)).toBe(5);
    expect(parsed.extracted.text.length).toBe(6);
  });

  it("replaces what cannot be sent and says how much it replaced", () => {
    const damaged = fromBytes(encoder.encode("before after"), "txt");
    expect(damaged.repaired).toBe(1);
    expect(damaged.text).toBe("before\u{fffd}after");
    expect(assess(damaged.text).suspicious).toBe(true);
  });
});
