import { expect, test, type Page } from "@playwright/test";

/**
 * A submission large enough to be compressed, in the engine that reads the
 * request differently.
 *
 * The client gzips the body once it passes sixty-four kilobytes, which is every
 * real manuscript and every buffer of more than one modest document. Reading
 * that body back needs the bytes of the request, and an engine that does not
 * expose a request as a stream answers with nothing at all rather than with an
 * error - so the body arrived empty, the parse failed, and the person was told
 * that something on the server went wrong for every submission worth making.
 * Nothing smaller than the threshold shows it, and the engine that does expose
 * the stream never showed it, which is why it is asked here and at this size.
 *
 * The failure was silent in the console and loud on the screen, so the
 * assertion is on both: no refusal notice, and results that actually arrived.
 */
function prose(seed: string, times: number): string {
  return `${seed} Dense retrieval is usually left to a frozen encoder in this work. `.repeat(
    times,
  );
}

async function submit(page: Page, files: readonly { name: string; times: number }[]) {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(
    files.map((file, index) => ({
      name: file.name,
      mimeType: "text/markdown",
      buffer: Buffer.from(prose(`Doc${index}.`, file.times), "utf8"),
    })),
  );
  await expect(page.getByTestId("document-card")).toHaveCount(files.length, {
    timeout: 90_000,
  });

  const cards = page.getByTestId("document-card");
  for (let index = 0; index < files.length; index += 1) {
    await cards.nth(index).getByTestId("check-presubmit").click();
  }
  await page.getByTestId("run").click();

  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("run-failure")).toHaveCount(0);
}

test("two documents past the compression threshold are checked", async ({ page }) => {
  await submit(page, [
    { name: "one.md", times: 700 },
    { name: "two.md", times: 700 },
  ]);
});

test("a buffer of several documents, two of them book-length, is checked", async ({
  page,
}) => {
  // Dissertation-shaped rather than sample-shaped: the largest of these is
  // about 1.6 million characters, and the buffer is around 2.5 million.
  await submit(page, [
    { name: "note.md", times: 40 },
    { name: "article.md", times: 4_000 },
    { name: "chapter.md", times: 120 },
    { name: "thesis.md", times: 9_000 },
    { name: "appendix.md", times: 700 },
    { name: "dissertation.md", times: 25_000 },
  ]);
});
