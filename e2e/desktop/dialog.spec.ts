import { expect, test } from "@playwright/test";

/**
 * How the answers of a dialogue sit on a screen wide enough to put them in a
 * row.
 *
 * They are read against each other, so they belong on one line: a question
 * whose answers are on separate lines has to be re-read before it can be
 * answered. On a narrow screen there is no room for a row and they stack, which
 * is the narrow suite's business.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\bibliography{refs}
\\end{document}
`;

test("the two answers of a dialogue stay side by side", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  await expect(page.getByTestId("document-card")).toHaveCount(1);
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "New check" }).click();
  const dialog = page.getByTestId("new-check-confirm");
  await expect(dialog).toBeVisible();

  // The action offered beside them may wrap away - it is not an answer - but
  // the two answers themselves share a line.
  const apart = await dialog.evaluate((panel) => {
    const named = (text: string) =>
      [...panel.querySelectorAll<HTMLElement>("button")]
        .find((button) => (button.textContent ?? "").includes(text))
        ?.getBoundingClientRect();
    const keep = named("Keep everything");
    const clear = named("Clear and start over");
    return keep === undefined || clear === undefined
      ? null
      : Math.abs(keep.top - clear.top);
  });
  expect(apart).not.toBeNull();
  expect(apart ?? 99).toBeLessThan(2);
});
