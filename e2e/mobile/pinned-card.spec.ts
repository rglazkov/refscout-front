import { expect, test } from "@playwright/test";

import { openOnAFinding, toResults } from "../support/findings";

/**
 * The card of the open finding on a phone.
 *
 * A block dropped into a column forty characters wide pushes the very line it
 * is about off the screen, so on a narrow screen the one open card is pinned
 * below the text instead of standing inside it. Everything else about the card
 * is the same card and is asked about once, over both of the places it is
 * drawn, in the fast tests.
 */
test.describe("the card on a narrow screen", () => {
  test("is pinned below the text instead of standing inside it", async ({ page }) => {
    await toResults(page);
    await openOnAFinding(page);

    /*
     * A block dropped into a column forty characters wide pushes the very line
     * it is about off the screen, so on a phone the one open card is pinned
     * below the text instead. The highlights above it stay where they are and
     * the arrows switch which card is pinned.
     */
    const pinned = page.getByTestId("pinned-finding");
    await expect(pinned).toBeVisible();
    await expect(pinned.getByTestId("finding-card")).toHaveCount(1);
    const outside = await pinned.evaluate(
      (node) => node.closest("[data-testid=editor]") === null,
    );
    expect(outside).toBe(true);

    const fixed = pinned.getByTestId("mark-fixed");
    await fixed.click();
    await expect(fixed).toHaveAttribute("aria-pressed", "true");
  });

  test("stands over the text without taking the text's height", async ({ page }) => {
    await toResults(page);
    await openOnAFinding(page);

    /*
     * A panel that took its height out of the layout would take it from the
     * manuscript: on a phone the field is most of what a person can see, and a
     * card half the screen tall would leave them reading a thesis through a
     * slot. It floats over the foot of the field instead, and the field keeps
     * every pixel it had.
     */
    const boxes = await page.evaluate(() => {
      const box = (selector: string) => {
        const node = document.querySelector(selector);
        return node === null ? null : node.getBoundingClientRect();
      };
      const editor = box("[data-testid=editor]");
      const card = box("[data-testid=pinned-finding]");
      return editor === null || card === null
        ? null
        : {
            editorBottom: Math.round(editor.bottom),
            cardTop: Math.round(card.top),
            cardBottom: Math.round(card.bottom),
          };
    });
    expect(boxes).not.toBeNull();
    // The field runs on under the card rather than stopping above it.
    expect(boxes?.editorBottom ?? 0).toBeGreaterThan(boxes?.cardTop ?? 0);
  });

  test("the end of the document comes out from under the card", async ({ page }) => {
    await toResults(page);
    await openOnAFinding(page);

    /*
     * Which is the other half of floating over the text. The last lines of a
     * manuscript arrive at the bottom of the field, and the bottom of the field
     * is where the card stands - so the text is given exactly the card's height
     * of room at its end, and scrolling brings the last line out above it.
     */
    const scroller = page.locator("[data-testid=editor] .cm-scroller");
    await scroller.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const lines = [...document.querySelectorAll("[data-testid=editor] .cm-line")];
          const last = lines.at(-1)?.getBoundingClientRect();
          const card = document
            .querySelector("[data-testid=pinned-finding]")
            ?.getBoundingClientRect();
          return last === undefined || card === undefined
            ? null
            : Math.round(card.top - last.bottom);
        }),
      )
      .toBeGreaterThan(0);
  });
});
