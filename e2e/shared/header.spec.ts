import { expect, test } from "@playwright/test";

/**
 * The header in two renderings. What is checked is not what the items are
 * called but that the sections can be reached at any width: an item that cannot
 * be reached from a phone simply does not exist for half of the visitors.
 *
 * The names the test does know - "Menu", "Theme", "Light/Dark" - are the
 * accessible names of the controls. They are the interface's promise to a
 * screen reader, and so they are checked deliberately.
 */
test.describe("wide screen", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("the items sit in a row and no menu button is needed", async ({ page }) => {
    await page.goto("/");

    const links = page.getByRole("navigation").getByRole("link");
    await expect(links).not.toHaveCount(0);
    for (const href of await links.evaluateAll((all) =>
      all.map((link) => link.getAttribute("href") ?? ""),
    )) {
      expect(href).toMatch(/^\/[a-z0-9-]+\/$/);
    }

    await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  });

  test("the current section is marked on its own page", async ({ page }) => {
    await page.goto("/");
    const first = page.getByRole("navigation").getByRole("link").first();
    const href = (await first.getAttribute("href")) ?? "/";

    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(
      page.getByRole("navigation").locator(`a[href="${href}"]`),
    ).toHaveAttribute("aria-current", "page");
  });
});

test.describe("narrow screen", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the items move behind the menu button and stay reachable", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation")).toBeHidden();

    const trigger = page.getByRole("button", { name: "Menu" });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    // Tailwind 4 no longer gives buttons cursor: pointer - a rule in the base
    // layer brings it back, and without this test it would quietly disappear.
    await expect(trigger).toHaveCSS("cursor", "pointer");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const menu = page.getByRole("dialog");
    const items = menu.getByRole("link");
    await expect(items).not.toHaveCount(0);

    const href = (await items.first().getAttribute("href")) ?? "/";
    await items.first().click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });

  test("the menu opens and closes from the keyboard and focus comes back", async ({
    page,
  }) => {
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Menu" });

    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("dialog");
    await expect(menu).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the header fits the width together with the theme and sign-in", async ({
    page,
  }) => {
    await page.goto("/");
    const header = page.locator("header");
    await expect(header.getByRole("group", { name: "Theme" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();

    // Width is why the toggle has two positions rather than three: on a narrow
    // screen, next to the menu and the sign-in, there is simply no room for a
    // third icon.
    expect(
      await header.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(0);
  });

  test("pressing a menu item is visible without hover too", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    const row = page.getByRole("dialog").getByRole("link").first();

    const idle = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    // On a touch device hover does not exist at all (@media (hover: hover)), so
    // the only feedback on a press is the :active state.
    await expect
      .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(idle);
    await page.mouse.up();
  });
});

test("theme toggle: two positions, starting from the environment theme", async ({
  page,
}) => {
  // The system is dark and no choice has been made, so "Dark" is shown pressed.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const group = page.getByRole("group", { name: "Theme" });

  await expect(group.getByRole("button")).toHaveCount(2);
  await expect(group.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(group.getByRole("button", { name: "Light" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await group.getByRole("button", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(group.getByRole("button", { name: "Light" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(group.getByRole("button", { name: "Dark" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

/**
 * The way past the header, for anybody moving through the page by keyboard.
 *
 * Six controls stand between the top of every page and its content, and they
 * are the same six each time. What is checked is the whole of what makes the
 * shortcut work: that it is the first thing Tab reaches, that it becomes
 * visible when it has the focus rather than staying where nobody can read it,
 * and that following it puts the focus in the content instead of only moving
 * the scroll position.
 */
test("the first stop is the way past the header, and it works", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skip = page.getByRole("link", { name: "Skip to the content" });
  await expect(skip).toBeFocused();
  // Off the top of the viewport until it is focused; in view once it is.
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});
