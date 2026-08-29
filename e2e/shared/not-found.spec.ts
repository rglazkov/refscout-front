import { expect, test } from "@playwright/test";

/**
 * The 404 document. It is the one page assembled outside the `[locale]` tree,
 * so the things every other page gets from the root layout are put on it by
 * hand - and each of them is a thing that can quietly stop happening.
 */
test.describe("an address that matched nothing", () => {
  test("is our page, and says so in a language", async ({ page }) => {
    const response = await page.goto("/no/such/address/");
    expect(response?.status()).toBe(404);

    // The page renders its own <html>, so the attribute is on the element
    // itself. A page that does not name its language is read out in whatever
    // voice the screen reader was last using (WCAG 3.1.1).
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("is styled, rather than arriving as bare markup", async ({ page }) => {
    await page.goto("/no/such/address/");

    // The stylesheet is imported by the page itself; without that import it
    // links nothing and the 404 reads as a broken site rather than a wrong
    // address. Asking the page for a token is how the other tests check this.
    const ground = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.backgroundColor = "var(--background)";
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    });
    expect(ground).not.toBe("rgba(0, 0, 0, 0)");
    expect(
      await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ).toBe(ground);
  });

  test("offers the way back, and it works", async ({ page }) => {
    await page.goto("/no/such/address/");
    await page.getByRole("main").getByRole("link").first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("hydrates without complaining about the theme attribute", async ({ page }) => {
    // The inline script writes data-theme onto <html> before React arrives, so
    // that element has to be the one this page rendered and marked
    // `suppressHydrationWarning`. Wrapped in a layout somebody else owns, every
    // 404 with a chosen theme hydrates onto a mismatch.
    const complaints: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") complaints.push(message.text());
    });
    page.on("pageerror", (error) => complaints.push(error.message));

    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/no/such/address/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    expect(complaints.filter((text) => /hydrat/i.test(text))).toEqual([]);
  });

  test("applies a chosen dark theme before the first paint", async ({ page }) => {
    // The theme script is on this page separately from every other page, so it
    // is the one copy that can go missing on its own.
    await page.addInitScript(() => {
      localStorage.setItem("theme", "dark");
    });
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/no/such/address/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});
