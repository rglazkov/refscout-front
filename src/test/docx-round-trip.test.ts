// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { assembleDocx } from "@/lib/parse/assemble";
import { parseDocx } from "@/lib/parse/docx";

import { bullet, buildDocx, paragraph, table, withFootnote } from "./corpus";

/**
 * The circle closes: a Word file is read, corrected as markdown and written
 * back out as a Word file - and read again to see what survived. Reading the
 * result is the check, because comparing against a stored file would turn red
 * on the assembler's next release over one attribute that moved.
 *
 * It runs against a browser's globals rather than Node's. The assembler ships a
 * build per environment and the product uses the browser one; testing the other
 * would be testing code that never runs here.
 */
async function roundTrip(body: string): Promise<string> {
  const first = await parseDocx(buildDocx(body));
  const rebuilt = await assembleDocx(first.extracted.text);
  const second = await parseDocx(rebuilt);
  return second.extracted.text;
}

const MANUSCRIPT = [
  paragraph("On the estimation of variance", "Heading1"),
  paragraph("Method", "Heading2"),
  paragraph("The estimator is unbiased under the stated assumptions."),
  bullet("Rinse the sample twice"),
  bullet("Dry it at 40 degrees", 1),
  withFootnote("A claim worth a note"),
  table([
    ["Sample", "Mass"],
    ["A", "12 g"],
  ]),
].join("");

describe("a Word file written back out", () => {
  it("is a Word file the reader opens again", async () => {
    const rebuilt = await assembleDocx("# A heading\n\nA paragraph.\n");
    // The container's own signature. A file that is not a zip is not a `.docx`,
    // whatever the extension on it says.
    expect([...rebuilt.slice(0, 2)]).toEqual([0x50, 0x4b]);
    expect((await parseDocx(rebuilt)).extracted.text).toContain("A heading");
  }, 30_000);

  it("keeps the headings, the lists, the tables and the notes", async () => {
    const markdown = await roundTrip(MANUSCRIPT);

    expect(markdown).toContain("# On the estimation of variance");
    expect(markdown).toContain("## Method");
    expect(markdown).toMatch(/[-*]\s+Rinse the sample twice/);
    expect(markdown).toMatch(/\|\s*Sample\s*\|/);
    expect(markdown).toContain("The footnote that proves footnotes survive.");
  }, 30_000);

  it("keeps the words of the manuscript", async () => {
    const markdown = await roundTrip(MANUSCRIPT);
    expect(markdown).toContain("The estimator is unbiased under the stated assumptions.");
  }, 30_000);

  it("writes a picture's description and never goes looking for the picture", async () => {
    /*
     * Pictures are dropped when the file is read and stay dropped. An `<img>`
     * reaching the assembler would be an address it would fetch over the
     * network, from inside a worker that is not allowed one - so the markdown
     * for a picture becomes the description its author wrote and nothing else.
     */
    const rebuilt = await assembleDocx("![a diagram of the setup](figure.png)\n");
    const markdown = (await parseDocx(rebuilt)).extracted.text;
    expect(markdown).toContain("a diagram of the setup");
    expect(markdown).not.toContain("figure.png");
  }, 30_000);

  it("carries markup in the text through as text", async () => {
    // The markdown came out of somebody's manuscript. A tag written in it is
    // five characters the author typed, not markup we are entitled to run.
    const rebuilt = await assembleDocx("A line with <script>alert(1)</script> in it.\n");
    const markdown = (await parseDocx(rebuilt)).extracted.text;
    expect(markdown).toContain("alert(1)");
  }, 30_000);
});
