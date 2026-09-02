import { expect, test, type Page } from "@playwright/test";

import { buildDocx, bullet, paragraph, table } from "../../src/test/corpus";

/**
 * The three formats that carry markup are highlighted, and the ones that do not
 * are left alone.
 *
 * A hundred BibTeX entries with the keys and the fields picked out are markedly
 * easier to read than the same hundred without, and reading them is the work: a
 * bibliography brought on its own is a document of the buffer, and the editor is
 * where it is corrected before it is sent. The check is that the marks reach the
 * text - a mode that failed to load leaves a perfectly ordinary-looking editor
 * behind it, which is why this is not something to leave to the eye.
 */
const BIBLIOGRAPHY = `@article{smith2019attention,
  title = {Attention Revisited},
  author = {Smith, Jane},
  year = {2019},
}
`;

const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\end{document}
`;

const PROSE = "Some notes with nothing to go on, and no markup of any kind.\n";

async function open(page: Page, name: string, body: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8"),
  });
  // The card exists before its text does - reading happens in a worker now -
  // and the volume is what says the text has arrived.
  await expect(page.getByTestId("document-card")).toContainText("characters");
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("editor")).toBeVisible();
}

/** The colours the marks were painted in, deduplicated. */
async function inks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const marks = document.querySelectorAll<HTMLElement>(".cm-content span[class]");
    const seen = new Set<string>();
    for (const mark of marks) seen.add(getComputedStyle(mark).color);
    return [...seen];
  });
}

test("a bibliography is highlighted", async ({ page }) => {
  await open(page, "refs.bib", BIBLIOGRAPHY);

  // More than one ink, because one would mean a single blanket mark rather than
  // an entry type, a key, a field and a value told apart.
  await expect.poll(async () => (await inks(page)).length).toBeGreaterThan(1);
});

test("a LaTeX manuscript is highlighted", async ({ page }) => {
  await open(page, "paper.tex", MANUSCRIPT);
  await expect.poll(async () => (await inks(page)).length).toBeGreaterThan(0);
});

test("prose with no markup is left alone", async ({ page }) => {
  // There is nothing in it to pick out, and colouring the accidental brace in a
  // sentence is worse than leaving the sentence as it was written.
  await open(page, "notes.txt", PROSE);
  await page.waitForTimeout(1000);
  expect(await inks(page)).toEqual([]);
});

test("the marks are colour, and the document is still the document", async ({ page }) => {
  await open(page, "refs.bib", BIBLIOGRAPHY);
  await expect.poll(async () => (await inks(page)).length).toBeGreaterThan(1);

  // Typed marks over flat text, never markup: the editor shows a document, and
  // what leaves for the server is the string it was given.
  const text = await page.getByTestId("editor").innerText();
  expect(text).toContain("@article{smith2019attention,");
  expect(text).toContain("title = {Attention Revisited},");

  // Nothing has changed size or weight in a way that would make the source stop
  // looking like source - the marks are ink.
  const sizes = await page.evaluate(() => {
    const marks = document.querySelectorAll<HTMLElement>(".cm-content span[class]");
    return [...new Set([...marks].map((mark) => getComputedStyle(mark).fontSize))];
  });
  expect(sizes).toHaveLength(1);
});

/**
 * What each of the marks actually picked out. A count of colours says the mode
 * loaded; this says the mode covered the document, which is the difference
 * between highlighting that works and highlighting that only looks like it.
 */
async function marked(page: Page): Promise<readonly string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".cm-content span[class]")].map(
      (node) => node.textContent ?? "",
    ),
  );
}

test.describe("markdown", () => {
  const MARKDOWN = [
    "# A heading",
    "",
    "Prose with **bold**, *italic*, a [link](https://example.org) and `code`.",
    "",
    "- an item",
    "",
    "| Sample | Mass |",
    "| --- | --- |",
    "| A | 12 g |",
    "",
    "~~struck~~",
    "",
  ].join("\n");

  test("every kind of markup in a .md is picked out", async ({ page }) => {
    await open(page, "notes.md", MARKDOWN);
    /*
     * One assertion per kind of markup, because a grammar that loaded and
     * covered headings alone would pass a count of colours while leaving the
     * rest of the document flat - which is what a mode that is wired up but
     * only half mapped looks like.
     */
    const kinds = [
      "#",
      "**",
      "bold",
      "*",
      "italic",
      "[",
      "link",
      "`",
      "code",
      "-",
      "|",
      "~~",
      "struck",
    ];
    // Polled rather than read once: the mode is fetched after the editor is
    // already on screen and swapped in when it arrives.
    for (const kind of kinds) {
      await expect
        .poll(async () => (await marked(page)).includes(kind), { message: kind })
        .toBe(true);
    }
  });

  test("bold is told apart from the text around it", async ({ page }) => {
    await open(page, "notes.md", MARKDOWN);
    /*
     * Asked as a number rather than left to the eye, and asked because the eye
     * is exactly what it got past: at a step above the body weight the marks
     * were there and legible on white, and on the dark theme - where light
     * letters bloom and the weights close up - bold and plain read the same.
     */
    const weightOf = (text: string) =>
      page.evaluate((wanted) => {
        const marks = [
          ...document.querySelectorAll<HTMLElement>(".cm-content span[class]"),
        ];
        const mark = marks.find((node) => node.textContent === wanted);
        return mark === undefined ? null : Number(getComputedStyle(mark).fontWeight);
      }, text);

    // Polled like the test above it: the mode arrives after the editor is on
    // screen, and before it does there are no marks to weigh.
    // Two steps of the axis, not one: JetBrains Mono carries up to 800 and the
    // dark theme spends most of the first step on itself.
    await expect.poll(() => weightOf("bold")).toBeGreaterThanOrEqual(800);

    const body = await page.evaluate(() => {
      const line = document.querySelector<HTMLElement>(".cm-content .cm-line");
      return line === null ? null : Number(getComputedStyle(line).fontWeight);
    });
    expect(body).toBe(400);
  });

  test("a Word document is highlighted as the markdown it became", async ({ page }) => {
    // This is the whole reason a `.docx` is kept as markdown rather than as
    // flat text: the person reads their document as a document.
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "thesis.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(
        buildDocx(
          [
            paragraph("A heading", "Heading1"),
            bullet("an item"),
            table([
              ["Sample", "Mass"],
              ["A", "12 g"],
            ]),
          ].join(""),
        ),
      ),
    });
    await expect(page.getByTestId("document-card")).toContainText("characters", {
      timeout: 60_000,
    });
    await page.getByRole("button", { name: "thesis.docx", exact: true }).click();
    await expect(page.getByTestId("editor")).toBeVisible();

    for (const kind of ["#", "|"]) {
      await expect
        .poll(async () => (await marked(page)).includes(kind), { message: kind })
        .toBe(true);
    }
  });
});

test("a commented-out entry in a bibliography is marked as a comment", async ({
  page,
}) => {
  /*
   * Commenting entries out is how people keep a bibliography, and whether to
   * count them is one of BibCheck's own settings - so a comment that reads as
   * live text matters more here than it would elsewhere.
   */
  await open(page, "refs.bib", "% @article{old2019, title = {Withdrawn}}\n");
  await expect
    .poll(async () => (await marked(page)).join(""))
    .toContain("% @article{old2019, title = {Withdrawn}}");
});
