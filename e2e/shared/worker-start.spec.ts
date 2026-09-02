import { expect, test } from "@playwright/test";

import { buildDocx, buildPdf, paragraph, textPage } from "../../src/test/corpus";

/**
 * Every kind of document is read, in whatever engine is running this.
 *
 * This is the test the second browser project exists for, and it is written as
 * one page rather than as a file of scenarios on purpose: what it asks is not
 * about the product's behaviour - `manuscripts.spec.ts` covers that - but about
 * whether a worker starts at all here.
 *
 * It is worth its own file because the defect it guards against does not look
 * like a defect. A worker that will not start answers nothing, raises nothing
 * and logs nothing, so the person sees a document that reads for two minutes
 * and then a message about their file. The whole suite was green while that was
 * true of every document in Firefox, because the whole suite ran in Chromium.
 */
/*
 * One at a time. Every test here reads real documents through a worker on a
 * budget generous enough to survive a browser that has to fall back to the
 * second build of it, and three of them racing for the same processor turns a
 * question about whether a worker starts into a question about how busy the
 * machine was.
 */
test.describe.configure({ mode: "default" });

const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
A manuscript brought as LaTeX.
\\end{document}
`;

test("a worker starts here, and reads text, PDF and Word", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("drop-zone")).toBeVisible();

  await page.getByTestId("file-input").setInputFiles([
    {
      name: "paper.tex",
      mimeType: "text/plain",
      buffer: Buffer.from(MANUSCRIPT, "utf8"),
    },
    {
      name: "paper.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(buildPdf([textPage(["A page of prose in a PDF."])])),
    },
    {
      name: "thesis.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from(buildDocx(paragraph("A paragraph of a Word document."))),
    },
  ]);

  // Generous, and it has to be: a browser that will not run a module worker is
  // found out by its silence, and only then does the second, larger build of
  // the worker get downloaded.
  const cards = page.getByTestId("document-card");
  await expect(cards).toHaveCount(3, { timeout: 60_000 });
  for (const name of ["paper.tex", "paper.pdf", "thesis.docx"]) {
    await expect(cards.filter({ hasText: name })).toContainText("characters", {
      timeout: 60_000,
    });
  }

  // Read, not merely accepted: the text is what the editor shows.
  await page.getByRole("button", { name: "paper.pdf", exact: true }).click();
  await expect(page.getByTestId("editor")).toContainText("A page of prose in a PDF.");
});

/**
 * The comparison runs in a worker of its own, so it is asked the same question
 * here: a browser that will not start one shows two texts and never a mark
 * between them, and it does that in silence.
 */
test("the comparison worker starts here too", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("drop-zone")).toBeVisible();
  await page.getByTestId("enter-diff").click();

  await page
    .getByTestId("diff-pane-input")
    .first()
    .setInputFiles({
      name: "paper_v6.tex",
      mimeType: "text/plain",
      buffer: Buffer.from(MANUSCRIPT, "utf8"),
    });
  await page
    .getByTestId("diff-pane-input")
    .nth(1)
    .setInputFiles({
      name: "paper_v7.tex",
      mimeType: "text/plain",
      buffer: Buffer.from(
        MANUSCRIPT.replace("brought as LaTeX", "brought as markdown"),
        "utf8",
      ),
    });

  // The same generosity, and for the same reason: the fallback build is fetched
  // only once the first worker has been silent for its three seconds.
  await expect(page.getByTestId("merge-panes")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("diff-summary")).toContainText("change", {
    timeout: 60_000,
  });
});

/**
 * The other half of what ships beside a worker. The maps are built - a
 * minified parser is unreadable without them - but they carry a copy of every
 * source the workers import and nothing loads them unless the developer tools
 * are open, so the export is not where they belong. Asked here because this is
 * the file about what the workers are as they are served.
 */
test("the workers ship without their source maps", async ({ request }) => {
  const script = await request.get("/workers/parse.worker.js");
  expect(script.ok()).toBe(true);
  // The comment goes with the file: left behind, it points the one person with
  // the tools open at a 404.
  expect(await script.text()).not.toContain("sourceMappingURL");

  const map = await request.get("/workers/parse.worker.js.map");
  expect(map.status()).toBe(404);
});
