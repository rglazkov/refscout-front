import { expect, test, type Page } from "@playwright/test";

/**
 * In the dark theme there is no flash of light on load. This is checked not by
 * eye but by the attribute already being in place by the time the document is
 * first parsed, with the page background already equal to the dark theme's
 * ground.
 *
 * The test knows no colour values: it asks the page what the --background token
 * resolved to. Otherwise editing the palette would break the tests, and the
 * colours would live in two places - in the tokens and here.
 */
async function backgroundToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--background)";
    document.body.append(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  });
}

async function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

test.describe("theme", () => {
  test("the stylesheet reaches the page at all", async ({ page }) => {
    // Every other test here compares one computed colour against another, and
    // two missing colours compare equal - so a page that loaded no CSS at all
    // once passed them. This one asks the blunt question first.
    await page.goto("/");

    const sheets = await page.evaluate(() => document.styleSheets.length);
    expect(sheets).toBeGreaterThan(0);
    expect(await backgroundToken(page)).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("a chosen dark theme is applied before the first paint", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });
    // The system is light: without the inline script the page would flash light.
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await bodyBackground(page)).toBe(await backgroundToken(page));
  });

  test("the system theme is followed without a reload", async ({ page }) => {
    await page.goto("/");

    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await backgroundToken(page);
    await expect.poll(() => bodyBackground(page)).toBe(dark);

    await page.emulateMedia({ colorScheme: "light" });
    const light = await backgroundToken(page);
    await expect.poll(() => bodyBackground(page)).toBe(light);

    // The themes really are different - otherwise the check above would always pass.
    expect(dark).not.toBe(light);
  });

  test("with no choice made the theme comes from the system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    // No attribute means the theme is chosen by @media in the tokens, not by storage.
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    expect(await bodyBackground(page)).toBe(await backgroundToken(page));
  });

  test("a choice made in one tab reaches the others", async ({ context }) => {
    // The `storage` event tells the other tab that something changed; it does
    // not change anything by itself. Until this test existed, the second tab
    // re-rendered to the value it already had and stayed in the old theme.
    const first = await context.newPage();
    const second = await context.newPage();
    for (const page of [first, second]) {
      await page.emulateMedia({ colorScheme: "light" });
      await page.goto("/");
    }

    await first
      .getByRole("group", { name: "Theme" })
      .getByRole("button", { name: "Dark" })
      .click();

    await expect(second.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await bodyBackground(second)).toBe(await backgroundToken(second));
  });

  test("the theme choice survives a reload", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page
      .getByRole("group", { name: "Theme" })
      .getByRole("button", { name: "Dark" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
