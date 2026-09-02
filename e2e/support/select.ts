import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The fixtures the two drop-down suites share. It is a helper rather than a
 * spec, because one spec importing another makes both of them run in whichever
 * project imported them - and the point of splitting them is that one of the
 * two belongs to a single width.
 */
export const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\bibliography{refs}
\\end{document}
`;

/**
 * The trigger, found by its slot rather than by its role. While the list is
 * open Radix marks the rest of the page `aria-hidden`, so a role query stops
 * finding the control the moment it is pressed - which is the moment these
 * suites are about.
 */
export async function openTheSettings(page: Page): Promise<Locator> {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  await expect(page.getByTestId("document-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Configure" }).click();
  const trigger = page
    .getByTestId("settings-bibcheck")
    .locator("[data-slot=select-trigger]")
    .first();
  await expect(trigger).toBeVisible();
  return trigger;
}

export function fillOf(target: Locator): Promise<string> {
  return target.evaluate((el) => getComputedStyle(el).backgroundColor);
}
