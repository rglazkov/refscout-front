import { expect, test, type Page } from "@playwright/test";

/**
 * The list of checks, the cards on the workspace screen and the pages
 * themselves are all built from the same files. The test checks that they do
 * not drift apart, and does so by reading the addresses off the page rather
 * than knowing them by heart.
 */
async function featureLinks(page: Page): Promise<string[]> {
  return page
    .getByRole("main")
    .getByRole("link")
    .evaluateAll((links) =>
      links
        .map((link) => link.getAttribute("href") ?? "")
        .filter((href) => /^\/features\/[a-z0-9-]+\/$/.test(href)),
    );
}

test("the workspace screen and the list of checks show the same set", async ({
  page,
}) => {
  await page.goto("/");
  const onWorkspace = await featureLinks(page);
  expect(onWorkspace.length).toBeGreaterThan(0);

  await page.goto("/features/");
  const onList = await featureLinks(page);

  expect([...onList].sort()).toEqual([...onWorkspace].sort());
});

test("every card leads to a check page that exists", async ({ page }) => {
  await page.goto("/features/");

  for (const href of await featureLinks(page)) {
    await page.goto(href);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    expect(((await heading.textContent()) ?? "").length).toBeGreaterThan(0);

    // Every check page has a way back to the list.
    await page.getByRole("main").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/features\/$/);
  }
});

test("a row on the workspace screen opens on click and responds to a press", async ({
  page,
}) => {
  await page.goto("/");

  /*
   * The working screen is mounted after hydration, and the list of checks sits
   * below it: until it has landed, the row is still moving down the page. A
   * pointer put on a row that then slides out from under it is over nothing at
   * all, and neither :hover nor :active applies - which is a flapping test rather
   * than a product that failed to answer.
   */
  await expect(page.locator("[data-workspace-screen]")).toBeVisible();

  const [href] = await featureLinks(page);
  expect(href).toBeDefined();
  const row = page
    .getByRole("main")
    .locator(`a[href="${href ?? ""}"]`)
    .first();

  await expect(row).toHaveCSS("cursor", "pointer");

  const idle = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
  // hover() scrolls to the row itself and checks that it accepts the pointer.
  // On a touch device hover does not exist at all - there :active provides the
  // response.
  await row.hover();
  await page.mouse.down();
  await expect
    .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(idle);
  await page.mouse.up();

  await expect(page).toHaveURL(new RegExp(`${href ?? ""}$`));
});
