import { expect, test, type Page } from "@playwright/test";

/**
 * The panes stay level while the reader jumps through the changes.
 *
 * It is a question about the wide screen alone: side by side the two panes are
 * held level by spacers whose height is measured after a layout, and on a
 * narrow one they stand one above the other, where being level means nothing.
 *
 * The lines here are long on purpose. Two things pulled the panes apart and
 * both need a real document to show up: a jump that scrolled in the same frame
 * as it moved the caret, and lines wrapping - a wrapped line is two rows in one
 * pane and one in the other, so the panes drift by a row at a time and the
 * drift is invisible until two lines that should face each other do not.
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

/** How far apart the two panes draw the change the caret is in. */
async function drift(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const first = (selector: string) => {
      const seen = [...document.querySelectorAll(selector)].find((line) => {
        const box = line.getBoundingClientRect();
        return box.height > 0 && box.top > 0 && box.top < window.innerHeight;
      });
      return seen === undefined ? null : Math.round(seen.getBoundingClientRect().top);
    };
    const a = first(".cm-merge-a .cm-changedLine");
    const b = first(".cm-merge-b .cm-changedLine");
    return a === null || b === null ? null : Math.abs(a - b);
  });
}

test("jumping through a long comparison leaves the two panes level", async ({ page }) => {
  /*
   * The editor says this out loud when something keeps invalidating the layout
   * it is measuring, and the arrangement here - two panes, spacers between
   * them, a position read out of both - is exactly where that happens.
   */
  const complaints: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Measure loop")) complaints.push(message.text());
  });

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

  const next = page.getByRole("button", { name: "Next change" });
  for (let jump = 1; jump <= 8; jump += 1) {
    await next.click();
    await expect(page.getByTestId("diff-summary")).toContainText(`Change ${jump} of 21`);
    // Polled: the jump moves the caret first and scrolls to it on the next
    // frame, which is the whole point of the arrangement being tested.
    await expect.poll(async () => drift(page)).toBe(0);
  }

  // Back the other way, and past the first change, which comes round again.
  const previous = page.getByRole("button", { name: "Previous change" });
  for (let jump = 7; jump >= 0; jump -= 1) {
    await previous.click();
    await expect.poll(async () => drift(page)).toBe(0);
  }

  expect(complaints).toEqual([]);
});
