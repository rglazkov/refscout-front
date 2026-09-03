import { expect, test, type Page } from "@playwright/test";

/**
 * The two panes are level at the change being read, and the page stays where it
 * was while the reader moves between changes.
 *
 * It is a question about the wide screen alone: side by side the two halves of
 * a change are read against each other, and on a narrow screen they stand one
 * above the other, where being level means nothing.
 *
 * The lines here are long on purpose. Lines wrap in the panes, because a
 * paragraph out of a Word file is one line of a thousand characters and
 * scrolling sideways to read it is not reading - and a wrapped line is exactly
 * where an editor's estimate of how tall the text above it is goes wrong. That
 * estimate is what pulled the panes a row or two apart, and it is why the
 * alignment is done by putting both halves of the change at the same height
 * rather than by trusting the heights above them.
 */
const SENTENCE =
  "dense retrieval is usually left to a frozen encoder and the corpus was read in " +
  "full by nobody at all, which is the length of sentence that fills a pane twice over";

const LINES = 1500;

/** One change every so many lines, which is the shape of a revised manuscript. */
const EVERY = 73;

function version(edited: boolean): string {
  const lines: string[] = [];
  for (let line = 0; line < LINES; line += 1) {
    const changed = edited && line % EVERY === 11;
    lines.push(
      `${line} ${SENTENCE} ${changed ? "as it now reads" : "as it was written"}`,
    );
  }
  return lines.join("\n");
}

/**
 * How far apart the two panes draw the change nearest the middle of them, which
 * after a jump is the change that was jumped to.
 */
async function drift(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const host = document.querySelector("[data-diff-panes] .cm-mergeView");
    if (host === null) return null;
    const box = host.getBoundingClientRect();
    const middle = box.top + box.height / 2;
    const nearest = (selector: string) => {
      let best: number | null = null;
      for (const line of document.querySelectorAll(selector)) {
        const top = line.getBoundingClientRect().top;
        if (best === null || Math.abs(top - middle) < Math.abs(best - middle)) best = top;
      }
      return best;
    };
    const a = nearest(".cm-merge-a .cm-changedLine");
    const b = nearest(".cm-merge-b .cm-changedLine");
    return a === null || b === null ? null : Math.round(Math.abs(a - b));
  });
}

async function compare(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("enter-diff").click();
  await page
    .getByTestId("diff-pane-input")
    .first()
    .setInputFiles({
      name: "v1.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(version(false), "utf8"),
    });
  await page
    .getByTestId("diff-pane-input")
    .nth(1)
    .setInputFiles({
      name: "v2.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(version(true), "utf8"),
    });
  // Generous, and for the reason the worker suite is: a browser that will not
  // start a module worker is found out by its silence, and only then is the
  // second build of the comparison worker fetched.
  await expect(page.getByTestId("merge-panes")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("diff-summary")).toContainText("21 changes");
}

test("jumping through a long comparison leaves the two panes level", async ({ page }) => {
  /*
   * The editor says this out loud when something keeps invalidating the layout
   * it is measuring, and the arrangement here - two panes, a position read out
   * of both, a scroll that answers a scroll - is exactly where that happens.
   */
  const complaints: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Measure loop")) complaints.push(message.text());
  });

  await compare(page);

  const next = page.getByRole("button", { name: "Next change" });
  for (let jump = 1; jump <= 8; jump += 1) {
    await next.click();
    await expect(page.getByTestId("diff-summary")).toContainText(`Change ${jump} of 21`);
    // A pixel of slack, and no more: the two halves are drawn at the same
    // height, and rounding a fractional one is all that is left.
    await expect.poll(async () => drift(page)).toBeLessThanOrEqual(1);
  }

  // Back the other way, and past the first change, which comes round again.
  const previous = page.getByRole("button", { name: "Previous change" });
  for (let jump = 7; jump >= 0; jump -= 1) {
    await previous.click();
    // A pixel of slack, and no more: the two halves are drawn at the same
    // height, and rounding a fractional one is all that is left.
    await expect.poll(async () => drift(page)).toBeLessThanOrEqual(1);
  }

  expect(complaints).toEqual([]);
});

test("the page stays where it was, including on the last change", async ({ page }) => {
  await compare(page);

  // The panes are read where they are: a jump inside them is not a reason for
  // the page under them to move.
  const start = await page.evaluate(() => Math.round(window.scrollY));
  await page.getByRole("button", { name: "Previous change" }).click();
  await expect(page.getByTestId("diff-summary")).toContainText("Change 21 of 21");
  await expect.poll(async () => drift(page)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(start);

  // And from a page that has been scrolled, which is where a jump that pulls
  // the page about is felt.
  await page.evaluate(() => window.scrollTo({ top: 120 }));
  const moved = await page.evaluate(() => Math.round(window.scrollY));
  await page.getByRole("button", { name: "Next change" }).click();
  await expect(page.getByTestId("diff-summary")).toContainText("Change 1 of 21");
  await expect
    .poll(async () => page.evaluate(() => Math.round(window.scrollY)))
    .toBe(moved);
});
