import { expect, type Page } from "@playwright/test";

import { READING_MS } from "./reading";

/**
 * The way to a finding standing in a text, which is a long way: a manuscript, a
 * bibliography attached to it, a check run against the mock, results, and the
 * step from the finding into the text it is about. Both screens that draw the
 * card of an open finding start here, so the walk is written once.
 *
 * The manuscript is long enough that the text scrolls and no longer than that.
 * Where a module worker cannot start, reading it is done on the page's own
 * thread, and three of these being read at once is the difference between a
 * suite that passes and one that gives up on a document.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
${Array.from(
  { length: 40 },
  (_, line) => `Line ${line + 1} of a manuscript long enough to scroll while it is read.`,
).join("\n")}
Dense retrieval is usually left to a frozen encoder.
\\bibliography{refs}
\\end{document}
`;

const BIBLIOGRAPHY = `@article{smith2019attention,
  title = {Attention Revisited},
  author = {Smith, Jane},
  year = {2019},
}
`;

/** A manuscript with a bibliography, checked, with the results on screen. */
export async function toResults(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  /*
   * The card appears the moment the file is dropped and fills in as the text is
   * read, so the volume is what says the reading has finished. The wait is a
   * long one because it is not the same wait in every engine: where a module
   * worker cannot start, the reading takes the fallback path and a manuscript
   * of this length is seconds rather than a frame.
   */
  await expect(page.getByTestId("document-card")).toContainText("characters", {
    timeout: READING_MS,
  });

  await page.getByTestId("configure").click();
  await page.getByTestId("attach-input-bibcheck").setInputFiles({
    name: "refs.bib",
    mimeType: "text/plain",
    buffer: Buffer.from(BIBLIOGRAPHY, "utf8"),
  });
  await expect(page.getByTestId("attachment-bibcheck")).toContainText("refs.bib");

  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
}

/** The text, opened standing on a finding that has a place in it. */
export async function openOnAFinding(page: Page): Promise<void> {
  const card = page.getByTestId("check-card").filter({ hasText: "BibCheck" });
  await card.getByRole("button", { name: /Open \(/ }).click();
  // The row of the list names the finding; what opens under it is where the
  // step into the text is offered.
  await page
    .getByRole("button", { name: /retracted/i })
    .first()
    .click();
  const shown = page.getByTestId("show-in-text").first();
  await expect(shown).toBeVisible();
  await shown.click();
  // The editor is fetched when a document is first opened and not before, so
  // the first opening of a session waits for a chunk rather than for a render.
  await expect(page.getByTestId("editor")).toBeVisible({ timeout: 20_000 });
}
