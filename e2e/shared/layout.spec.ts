import { expect, test, type Page } from "@playwright/test";

/**
 * Four measurements of the working screen that nothing else would notice going
 * wrong.
 *
 * A dialogue whose buttons are outside it, a card that gives a seventh of a
 * phone to an icon's indent, and a screen that opens with a hand's width of
 * nothing under the header all render perfectly happily: no test fails, no
 * error is logged, and the only thing that reports them is somebody looking.
 * So they are measured.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\bibliography{refs}
\\end{document}
`;

async function drop(page: Page): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  await expect(page.getByTestId("document-card")).toHaveCount(1);
}

test("a dialogue keeps its answers inside itself", async ({ page }) => {
  await page.goto("/");
  await drop(page);
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "New check" }).click();
  const dialog = page.getByTestId("new-check-confirm");
  await expect(dialog).toBeVisible();

  const fits = await dialog.evaluate((panel) => {
    const outer = panel.getBoundingClientRect();
    const buttons = [...panel.querySelectorAll<HTMLElement>("button")];
    return buttons.every((button) => {
      const box = button.getBoundingClientRect();
      return box.left >= outer.left - 1 && box.right <= outer.right + 1;
    });
  });
  expect(fits).toBe(true);
});

test("a document name looks like the control it is, before it is touched", async ({
  page,
}) => {
  /*
   * The name is the only way into the text, in the buffer and on the results
   * alike. Left looking like a word it has to be discovered by putting a
   * pointer on it - which on a touch screen never happens at all.
   */
  await page.goto("/");
  await drop(page);

  const inBuffer = page.getByRole("button", { name: "paper.tex", exact: true });
  await expect(inBuffer).toHaveCSS("text-decoration-line", "underline");

  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("document-name-open")).toHaveCSS(
    "text-decoration-line",
    "underline",
  );
});

test("the row of check cards is centred, last row included", async ({ page }) => {
  await page.goto("/");
  await drop(page);
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("check-card").first()).toBeVisible();

  // Measured as the two margins of every row rather than as a class name: what
  // matters is that the space left over is shared, and a grid centring its
  // columns while leaving the last card in the first of them passes any test
  // written against the container alone.
  //
  // Polled, because the cards arrive one after another with a stagger: measured
  // mid-flight they are still carrying an offset, and rows read off those
  // positions are not the rows that will be there a moment later.
  const measure = () =>
    page.evaluate(() => {
      const cards = [
        ...document.querySelectorAll<HTMLElement>("[data-testid=check-card]"),
      ];
      const host = cards[0]?.parentElement;
      if (host === undefined || host === null || cards.length === 0) return [-1];
      const outer = host.getBoundingClientRect();
      const byTop = new Map<number, DOMRect[]>();
      for (const card of cards) {
        const box = card.getBoundingClientRect();
        const key = Math.round(box.top);
        byTop.set(key, [...(byTop.get(key) ?? []), box]);
      }
      return [...byTop.values()].map((row) => {
        const left = Math.min(...row.map((box) => box.left)) - outer.left;
        const right = outer.right - Math.max(...row.map((box) => box.right));
        return Math.round(Math.abs(left - right));
      });
    });

  await expect.poll(async () => Math.max(...(await measure()))).toBeLessThanOrEqual(2);
  expect((await measure()).length).toBeGreaterThan(0);
});

test("the screen does not open with a hand's width under the header", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-workspace-screen]")).toBeVisible();
  await drop(page);
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

  /*
   * The heading of the screen is the first thing on the page once the hero has
   * folded away, and the padding that gave the hero room goes with it. Polled,
   * because both of those travel: measured while they are still moving, the gap
   * is whatever it was on the way.
   */
  await expect
    .poll(() =>
      page.evaluate(() => {
        const header = document.querySelector("header");
        const heading = document.querySelector("#results-heading");
        if (header === null || heading === null) return 999;
        return Math.round(
          heading.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
        );
      }),
    )
    .toBeLessThan(56);
});
