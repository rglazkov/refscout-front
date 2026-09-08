import { expect, test } from "@playwright/test";

import { openOnAFinding, toResults } from "../support/findings";

/**
 * The card of a finding, opened under the line it belongs to.
 *
 * Three claims are checked here and none of them is visible when it holds. The
 * card must survive results arriving and marks being made without being built
 * again, or the button under somebody's hand loses the focus. It must keep its
 * own presses, or the editor takes them for presses on the document and the
 * buttons quietly stop working. And it must declare its height before it is
 * drawn, or the line the person was reading walks up the screen the moment they
 * open a card. All three read as random breakage rather than as a missing
 * feature, which is why they are written down.
 *
 * It is a wide-screen file because the block is a wide-screen thing: on a phone
 * the same card is pinned below the text instead, and that is asked about where
 * the narrow screens are.
 */
test.describe("the card inside the text", () => {
  test("stands in the text and is the only place the finding is acted on", async ({
    page,
  }) => {
    await toResults(page);
    await openOnAFinding(page);

    /*
     * One card is open at a time, whatever else is highlighted: a hundred
     * findings drawn as a hundred blocks between the paragraphs is a document
     * nobody can read.
     */
    const cards = page.locator("[data-testid=finding-card]");
    await expect(cards).toHaveCount(1);

    // And it is inside the field rather than beside it: the block is a part of
    // the document the editor draws.
    const inside = await cards.evaluate(
      (node) => node.closest("[data-testid=editor]") !== null,
    );
    expect(inside).toBe(true);

    /*
     * The presses belong to the card. Without that the editor takes them for
     * presses on its own text, puts the caret where the button was and the
     * buttons stop working - which is the failure this card is most likely to
     * have and the one that looks least like a defect.
     */
    const fixed = cards.getByTestId("mark-fixed");
    await fixed.click();
    await expect(fixed).toHaveAttribute("aria-pressed", "true");

    // And the card is not part of the manuscript: it stands inside a field a
    // person types into, and the editor marks the block as not editable so
    // that what is typed cannot land in it.
    const shielded = await cards.evaluate(
      (node) => node.closest("[contenteditable=false]") !== null,
    );
    expect(shielded).toBe(true);

    const ignored = cards.getByTestId("mark-ignored");
    await ignored.click();
    await expect(ignored).toHaveAttribute("aria-pressed", "true");
    await expect(fixed).toHaveAttribute("aria-pressed", "false");
  });

  test("marking a finding does not rebuild the card under the hand on it", async ({
    page,
  }) => {
    await toResults(page);
    await openOnAFinding(page);

    const cards = page.locator("[data-testid=finding-card]");
    const fixed = cards.getByTestId("mark-fixed");
    await fixed.focus();
    await expect(fixed).toBeFocused();

    /*
     * A mark rebuilds the decorations of the whole document, which is the
     * moment a widget compared by identity rather than by content would be
     * thrown away and built again. The card is the same element afterwards and
     * the focus is still in it.
     */
    await cards.evaluate((node) => node.setAttribute("data-seen", "1"));

    await fixed.press("f");
    await expect(cards).toHaveAttribute("data-seen", "1");
    await expect(fixed).toBeFocused();
    await expect(fixed).toHaveAttribute("aria-pressed", "true");
  });

  test("opening a card does not move the line being read", async ({ page }) => {
    await toResults(page);
    await page.getByTestId("document-name-open").click();
    await expect(page.getByTestId("editor")).toBeVisible();

    // A place well down the document, so that opening a card above it would
    // show as the text sliding under the reader.
    const scroller = page.locator("[data-testid=editor] .cm-scroller");
    await scroller.evaluate((node) => {
      node.scrollTop = 400;
    });
    const before = await scroller.evaluate((node) => node.scrollTop);

    /*
     * The block declares a height before it is drawn, so the editor lays the
     * document out with room for it rather than discovering it afterwards and
     * correcting the scroll. What is asked here is that the position the person
     * was reading at survives a card opening somewhere else in the document.
     */
    const row = page.getByTestId("panel-finding").last();
    await row.getByRole("button").first().click();
    // The list beside the text is an index: pressing a row opens the card in
    // the text rather than unfolding a second copy of it inside the row.
    await expect(row.getByTestId("mark-fixed")).toHaveCount(0);
    await expect(page.locator("[data-testid=finding-card]")).toHaveCount(1);

    /*
     * The card is scrolled to on purpose, so the position does move - what must
     * not happen is the document being laid out a second time underneath it,
     * which is what a block of unannounced height causes. So the position is
     * read twice with a gap and has to be the same both times: the text has
     * come to rest rather than still being corrected under the reader.
     */
    const at = async () => {
      const measured = await scroller.evaluate(
        (node) =>
          new Promise<number>((resolve) => {
            setTimeout(() => resolve(node.scrollTop), 400);
          }),
      );
      return measured;
    };
    const first = await at();
    expect(await at()).toBe(first);
    expect(before).toBeGreaterThan(0);
  });
});
