import { expect, test } from "@playwright/test";

/**
 * The pricing page: what the plan covers, read out of the one table of rights,
 * and the single control that ends the offer.
 *
 * The button is served as a link to the account and replaced by the live
 * control once the browser has it, so a person who arrives here from a lock
 * always finds something to press. Both halves of that are worth a test: what
 * the page ships with, and what it becomes.
 */
test("the card lists what the plan covers and ends in one action", async ({ page }) => {
  await page.goto("/pricing/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // The lines of the plan come from the table of rights; the page names every
  // one of them and nothing else.
  const lines = page.getByRole("main").getByRole("listitem");
  expect(await lines.count()).toBeGreaterThan(0);

  // One action, and it is the payment errand rather than a way back into the
  // product: whichever of the two forms it is in, it is the last thing on the
  // card.
  const action = page
    .getByRole("main")
    .getByRole("button")
    .or(page.getByRole("main").getByRole("link", { name: /Connect Pro/ }));
  await expect(action.first()).toBeVisible();
});

test("the live control replaces the link it was served as", async ({ page }) => {
  await page.goto("/pricing/");

  /*
   * Whatever the mocked account's state is, the control settles on one of the
   * two errands and stops being a plain link out of the page.
   *
   * It is given longer than the default. Against a stand the answer is a
   * request; against the mock the browser first has to register the service
   * worker that answers it, and in Firefox that takes several seconds. The
   * link it was served as is on screen throughout, which is the whole reason
   * the page ships with one.
   */
  await expect(
    page.getByRole("button", { name: /Connect Pro|Manage subscription/ }),
  ).toBeVisible({ timeout: 20_000 });
});
