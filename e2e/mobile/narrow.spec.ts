import { expect, test } from "@playwright/test";

/**
 * What the narrow screen gets that the wide one does not.
 *
 * Both of these are width given back to the content. On a phone the working
 * screen is the whole of what a person can see, and every indent that exists to
 * line something up with something else is taken out of the line they are
 * reading.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\bibliography{refs}
\\end{document}
`;

test("the card indents its heading, not the whole of itself", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  // The card appears before its text does and fills in as the worker reads it,
  // so the measurement waits for the finished card.
  await expect(page.getByTestId("document-card")).toContainText("characters");

  /*
   * The icon belongs to the heading. Indenting the body past it as well costs
   * forty-odd pixels of every row - a seventh of the screen - so that four
   * checkboxes can line up under a name.
   */
  const lefts = await page.getByTestId("document-card").evaluate((card) => {
    const left = (selector: string) => {
      const node = card.querySelector<HTMLElement>(selector);
      return node === null ? null : Math.round(node.getBoundingClientRect().left);
    };
    return {
      icon: left("span[aria-hidden=true]"),
      name: left("button[data-variant=link]"),
      plan: left("[data-testid=check-plan]"),
    };
  });

  expect(lefts.icon).not.toBeNull();
  expect(lefts.name ?? 0).toBeGreaterThan(lefts.icon ?? 0);
  // The body starts where the icon does, not where the name does.
  expect(lefts.plan).toBe(lefts.icon);
});

test("the editor keeps its margins narrow", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  // The card appears before its text does and fills in as the worker reads it,
  // so the measurement waits for the finished card.
  await expect(page.getByTestId("document-card")).toContainText("characters");
  await page.getByRole("button", { name: "paper.tex", exact: true }).click();
  await expect(page.getByTestId("editor")).toBeVisible();

  // There is no page behind the overlay to separate the field from - the
  // overlay is the whole screen - so the margin is width the line does not get.
  const padding = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("[data-slot=dialog-content]");
    if (panel === null) return null;
    const style = getComputedStyle(panel);
    return [Number.parseFloat(style.paddingLeft), Number.parseFloat(style.paddingRight)];
  });
  expect(padding).not.toBeNull();
  for (const side of padding ?? [99, 99]) expect(side).toBeLessThanOrEqual(8);
});

test("the line numbers are cells, and the one being edited is lit", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  // The card appears before its text does and fills in as the worker reads it,
  // so the measurement waits for the finished card.
  await expect(page.getByTestId("document-card")).toContainText("characters");
  await page.getByRole("button", { name: "paper.tex", exact: true }).click();
  await expect(page.getByTestId("editor")).toBeVisible();

  const gutter = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>(".cm-gutters");
    const editor = document.querySelector<HTMLElement>(".cm-content");
    const active = document.querySelector<HTMLElement>(".cm-activeLineGutter");
    const idle = [...document.querySelectorAll<HTMLElement>(".cm-gutterElement")].find(
      (cell) => !cell.classList.contains("cm-activeLineGutter"),
    );
    if (column === null || editor === null || active === null || idle === undefined) {
      return null;
    }
    return {
      // A surface of its own, stepped off the text and ruled away from it.
      columnFill: getComputedStyle(column).backgroundColor,
      textFill: getComputedStyle(editor).backgroundColor,
      rule: getComputedStyle(column).borderRightWidth,
      activeFill: getComputedStyle(active).backgroundColor,
      idleFill: getComputedStyle(idle).backgroundColor,
      activeWeight: getComputedStyle(active).fontWeight,
    };
  });

  expect(gutter).not.toBeNull();
  expect(gutter?.columnFill).not.toBe(gutter?.textFill);
  expect(Number.parseFloat(gutter?.rule ?? "0")).toBeGreaterThan(0);
  // The cell of the line being edited is lit, and the others are not.
  expect(gutter?.activeFill).not.toBe(gutter?.idleFill);
});

test("a stacked dialogue gives every button the same width", async ({ page }) => {
  /*
   * On a narrow panel the answers stack, and what is offered beside them stacks
   * with them. A short button among full-width ones does not read as a third
   * choice - it reads as something left over.
   */
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  // The card appears before its text does and fills in as the worker reads it,
  // so the measurement waits for the finished card.
  await expect(page.getByTestId("document-card")).toContainText("characters");
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "New check" }).click();
  const dialog = page.getByTestId("new-check-confirm");
  await expect(dialog).toBeVisible();

  const widths = await dialog.evaluate((panel) =>
    [...panel.querySelectorAll<HTMLElement>("button")].map((button) =>
      Math.round(button.getBoundingClientRect().width),
    ),
  );
  expect(widths.length).toBe(3);
  expect(new Set(widths).size).toBe(1);
});

test("a check card lands on the height it flew to", async ({ page }) => {
  /*
   * The findings unfold in one motion or they do not, and on a phone is where
   * the difference shows. A row of the list stands at the height the list
   * declares for a folded row until the browser decides the row is worth
   * drawing, and on a narrow screen a real row wraps onto three lines - so a
   * card measured before that decision is measured short, flies to the short
   * height and then steps to its real one. Nothing reports it but somebody
   * watching the card open twice, so the two heights are compared.
   */
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  await expect(page.getByTestId("document-card")).toContainText("characters");
  await page.getByTestId("run").click();
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

  const opening = page.getByRole("button", { name: /Open \(/ }).first();
  await expect(opening).toBeVisible();
  await opening.scrollIntoViewIfNeeded();

  const flight = await opening.evaluate(async (button: HTMLElement) => {
    const card = button.closest("[data-testid=check-card]");
    if (card === null) return null;
    const heights: { readonly height: number; readonly flying: boolean }[] = [];
    let stop = false;
    const sample = () => {
      heights.push({
        height: Math.round(card.getBoundingClientRect().height),
        // While it is in flight the card is taken out of the page and moved
        // between the two rectangles; landing puts it back.
        flying: getComputedStyle(card).position === "fixed",
      });
      if (!stop) requestAnimationFrame(sample);
    };
    button.click();
    sample();
    await new Promise((resolve) => setTimeout(resolve, 900));
    stop = true;
    const flown = heights.filter((frame) => frame.flying);
    return {
      folded: heights[0]?.height ?? 0,
      arrived: flown.at(-1)?.height ?? 0,
      settled: heights.at(-1)?.height ?? 0,
    };
  });

  expect(flight).not.toBeNull();
  // It opened at all, and by more than a rounding error.
  expect(flight?.settled ?? 0).toBeGreaterThan((flight?.folded ?? 0) + 20);
  // And the last height of the flight is the height it keeps.
  expect(Math.abs((flight?.arrived ?? 0) - (flight?.settled ?? 0))).toBeLessThanOrEqual(
    1,
  );
});
