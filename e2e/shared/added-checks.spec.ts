import { expect, test, type Page } from "@playwright/test";

/**
 * Adding checks to results that are already on screen.
 *
 * The promise that makes the button safe to press is that nothing found so far
 * leaves the screen: the added checks run as a job of their own and their
 * findings join the ones already there - and stay there after a reload, which
 * is the moment a second job is easiest to lose track of.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\bibliography{refs}
\\end{document}
`;

/**
 * A manuscript with BibCheck alone ticked. A .tex that names a bibliography
 * arrives with BibCheck proposed once its text has been read, and the others
 * proposed beside it are unticked: they are what the results will offer to add.
 */
async function dropManuscript(page: Page): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  const card = page.getByTestId("document-card");
  await expect(card).toHaveCount(1);
  // The proposal comes when the text has been read, and reading runs in a
  // worker: on a busy machine, through the classic-worker path a browser
  // without module workers takes, that was measured at up to six seconds.
  await expect(card.getByTestId("check-bibcheck")).toHaveAttribute(
    "data-state",
    "checked",
    { timeout: 15_000 },
  );
  // The proposal has been made, so nothing will tick these again; everything
  // but BibCheck is left for the results to offer.
  for (const check of ["glossary", "presubmit", "cite"]) {
    const toggle = card.getByTestId(`check-${check}`);
    if ((await toggle.getAttribute("data-state")) === "checked") await toggle.click();
    await expect(toggle).toHaveAttribute("data-state", "unchecked");
  }
}

test("added checks join the findings already on screen and survive a reload", async ({
  page,
}) => {
  await page.goto("/");
  await dropManuscript(page);
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

  const cards = page.getByTestId("check-card");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-module", "bibcheck");

  await page.getByTestId("add-checks-open").click();
  const dialog = page.getByTestId("add-checks");
  await expect(dialog).toBeVisible();
  // The check that has already run is not offered again.
  await expect(dialog.getByTestId("check-bibcheck")).toHaveCount(0);
  await dialog.getByTestId("check-glossary").click();
  await dialog.getByTestId("add-checks-run").click();

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
  await expect(cards).toHaveCount(2);
  await expect(
    page.locator("[data-testid='check-card'][data-module='bibcheck']"),
  ).toHaveCount(1);
  await expect(
    page.locator("[data-testid='check-card'][data-module='glossary']"),
  ).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
  await expect(cards).toHaveCount(2);
});

test("New check is the filled answer of the panel that follows the findings", async ({
  page,
}) => {
  await page.goto("/");
  await dropManuscript(page);
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

  const actions = page.getByTestId("results-actions");
  await expect(actions.getByTestId("new-check")).toHaveAttribute(
    "data-variant",
    "default",
  );
  await expect(actions.locator("[data-variant='default']")).toHaveCount(1);

  // The panel is as tall as its sentence and its answers. A width given to the
  // sentence in a row turns into a height when the row stacks on a phone, and
  // the answers then sit a screen below the sentence they answer.
  const panel = await page.getByTestId("next-steps").boundingBox();
  expect(panel?.height ?? 0).toBeLessThan(260);

  // Every answer in the row stays on the screen at this width.
  const inside = await actions.evaluate((row) =>
    [...row.querySelectorAll<HTMLElement>("button")].every((button) => {
      const box = button.getBoundingClientRect();
      return box.left >= 0 && box.right <= document.documentElement.clientWidth;
    }),
  );
  expect(inside).toBe(true);
});
