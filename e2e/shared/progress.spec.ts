import { expect, test } from "@playwright/test";

/**
 * The run says which document each check is running on.
 *
 * A flat list of module names answers the question only for a buffer of one:
 * with two manuscripts it reads "BibCheck, PreSubmit, Cite, PreSubmit, Cite"
 * and the person watching cannot tell which of their files is being worked on.
 * So the run is grouped the way the results are - the document, then the checks
 * under it - because it is the same question asked earlier.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\bibliography{refs}
\\end{document}
`;

const THESIS = `\\documentclass{book}
\\begin{document}
\\newacronym{mrr}{MRR}{mean reciprocal rank}
Prose about retrieval.
\\end{document}
`;

test("the run names the document each check is running on", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles([
    {
      name: "paper_v7.tex",
      mimeType: "text/plain",
      buffer: Buffer.from(MANUSCRIPT, "utf8"),
    },
    { name: "thesis.tex", mimeType: "text/plain", buffer: Buffer.from(THESIS, "utf8") },
  ]);
  await expect(page.getByTestId("document-card")).toHaveCount(2);

  await page.getByTestId("run").click();
  const progress = page.getByTestId("progress");
  await expect(progress).toBeVisible({ timeout: 10_000 });

  // Both documents are named, as headings rather than as words in a row.
  const headings = progress.getByRole("heading", { level: 3 });
  await expect(headings).toHaveCount(2);
  await expect(headings.nth(0)).toContainText("paper_v7.tex");
  await expect(headings.nth(1)).toContainText("thesis.tex");

  /*
   * And every check sits under the document it is running on rather than in a
   * list of its own. Read off the document each row is under, so that a screen
   * which merely printed the two names somewhere would not pass.
   */
  const grouped = await progress.evaluate((panel) => {
    const groups = [...panel.querySelectorAll<HTMLElement>("section")];
    return groups.map((group) => ({
      document: group.querySelector("h3")?.textContent?.trim() ?? "",
      checks: [...group.querySelectorAll<HTMLElement>("[data-testid=stage-row]")].map(
        (row) => (row.textContent ?? "").trim(),
      ),
    }));
  });

  expect(grouped).toHaveLength(2);
  expect(grouped[0]?.document).toContain("paper_v7.tex");
  expect(grouped[0]?.checks.join(" ")).toContain("BibCheck");
  expect(grouped[1]?.document).toContain("thesis.tex");
  // The second manuscript names no bibliography, so BibCheck is not on it - and
  // the grouping is what makes that legible rather than confusing.
  expect(grouped[1]?.checks.join(" ")).not.toContain("BibCheck");
});

test("a check that belongs to no document is not filed under one", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper_v7.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  await expect(page.getByTestId("document-card")).toHaveCount(1);
  await page.getByTestId("run").click();

  const progress = page.getByTestId("progress");
  await expect(progress).toBeVisible({ timeout: 10_000 });

  // "Text accepted" is a stage of the run, not of a manuscript: it stands above
  // the documents rather than inside the first of them.
  const first = progress.locator("[data-testid=stage-row]").first();
  await expect(first).toContainText("Text accepted");
  /*
   * And it carries no clock. The row is finished the moment the run exists, so
   * its duration is nothing - and a "0:00" standing at the top of the screen
   * while the rows beneath it count upwards reads as a clock that has stopped,
   * which is the one thing a progress screen must not look like.
   */
  await expect(first).not.toContainText(":0");
  // Not inside a document group, which is a section carrying a document as its
  // heading. The progress panel is itself a section, so "any section" is not
  // the question being asked.
  const filed = await first.evaluate(
    (row) => (row.closest("section")?.querySelector(":scope > h3") ?? null) !== null,
  );
  expect(filed).toBe(false);
});
