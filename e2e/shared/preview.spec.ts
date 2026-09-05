import { expect, test, type Page } from "@playwright/test";

/**
 * The preview: a markdown document drawn as a document rather than as the
 * markup it is stored in. This is the point of reading a Word file into
 * markdown at all - the person brought something with headings, lists and
 * tables, and they should be able to see one.
 *
 * What is asked here is what cannot be seen by looking at a working screen: that
 * the page is built out of elements and never out of a string of markup, so
 * that a tag typed into somebody's manuscript stays the characters they typed;
 * that the switch is on every markdown document and on no other kind; and that
 * looking at the page and coming back does not cost the editor its history,
 * which would quietly take away every undo a person had left.
 */
const MARKDOWN = [
  "# Method",
  "",
  "Prose with **bold** and [a link](https://example.org/paper).",
  "",
  "- first item",
  "- second item",
  "",
  "| Sample | Mass |",
  "| --- | --- |",
  "| A | 12 g |",
  "",
  '<b onmouseover="alert(1)">not a tag</b>',
  "",
].join("\n");

const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\end{document}
`;

async function drop(page: Page, name: string, body: string): Promise<void> {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(body, "utf8"),
  });
  /*
   * The card exists before its text does - reading happens in a worker - so the
   * volume is what says the document is ready to be opened. The wait is a long
   * one because this file runs in the second engine too, and there the worker
   * takes the fallback path rather than the module one.
   */
  await expect(page.getByTestId("document-card")).toContainText("characters", {
    timeout: 60_000,
  });
}

async function open(page: Page, name: string, body: string): Promise<void> {
  await drop(page, name, body);
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("editor")).toBeVisible();
}

test("a markdown document is drawn as a document", async ({ page }) => {
  await open(page, "notes.md", MARKDOWN);
  await page.getByTestId("view-preview").click();

  const preview = page.getByTestId("preview");
  await expect(preview).toBeVisible();
  // The source is out of the way rather than gone: the editor keeps the
  // document, the cursor and the history while the page is up.
  await expect(page.getByTestId("editor")).toBeHidden();

  await expect(preview.getByRole("heading", { name: "Method" })).toBeVisible();
  await expect(preview.getByRole("listitem").first()).toHaveText("first item");
  await expect(preview.getByRole("cell", { name: "12 g" })).toBeVisible();
  await expect(preview.getByRole("link", { name: "a link" })).toHaveAttribute(
    "href",
    "https://example.org/paper",
  );
  // The marks are set rather than shown: the asterisks are markup and the word
  // between them is bold.
  await expect(preview.locator("strong")).toHaveText("bold");
});

test("a tag written into the document stays the characters it is", async ({ page }) => {
  await open(page, "notes.md", MARKDOWN);
  await page.getByTestId("view-preview").click();

  const preview = page.getByTestId("preview");
  await expect(preview).toContainText('<b onmouseover="alert(1)">not a tag</b>');
  // Nothing of it reached the page as an element. The tree is built from the
  // parser's tokens, so there is no string of markup for a tag to arrive in.
  await expect(preview.locator("b, img, script")).toHaveCount(0);
});

test("only a markdown document offers the switch", async ({ page }) => {
  // There is nothing in a LaTeX manuscript, a bibliography or the text out of a
  // PDF to preview: what would be drawn is the text that is already on screen.
  await open(page, "paper.tex", MANUSCRIPT);
  await expect(page.getByTestId("view-preview")).toHaveCount(0);
});

test("going to the page and back keeps what the editor knows", async ({ page }) => {
  await open(page, "notes.md", MARKDOWN);

  const editor = page.getByTestId("editor");
  await editor.getByRole("textbox").click();
  await page.keyboard.type("A line typed before looking at the page.");
  await expect(editor).toContainText("A line typed before looking at the page.");

  await page.getByTestId("view-preview").click();
  await expect(page.getByTestId("preview")).toBeVisible();
  await page.getByTestId("view-code").click();
  await expect(editor).toBeVisible();

  /*
   * The undo history is the thing at stake. Taking the editor down while the
   * page is up and building it again on the way back would look like nothing at
   * all until somebody pressed undo and found that the corrections they made
   * before opening the preview could no longer be taken back.
   */
  await editor.getByRole("textbox").click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(editor).not.toContainText("A line typed before looking at the page.");
});

test("a file a check wrote is previewed where it is read", async ({ page }) => {
  /*
   * The third place a markdown document is open: the corrected file a check
   * hands back, opened from its card. PreSubmit writes a checklist in markdown,
   * and a checklist is exactly the kind of thing nobody wants to read as a list
   * of hyphens and hashes.
   */
  await drop(page, "paper.tex", MANUSCRIPT);
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

  const artifacts = page.getByTestId("open-artifact");
  await expect.poll(() => artifacts.count()).toBeGreaterThan(0);

  // The one that wrote markdown, found by the extension its file is saved under.
  const count = await artifacts.count();
  for (let index = 0; index < count; index += 1) {
    await artifacts.nth(index).click();
    const overlay = page.getByRole("dialog");
    await expect(overlay).toBeVisible();
    if ((await overlay.getByTestId("view-preview").count()) > 0) {
      await overlay.getByTestId("view-preview").click();
      await expect(page.getByTestId("preview")).toBeVisible();
      return;
    }
    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
  }
  throw new Error("no check handed back a markdown file to preview");
});
