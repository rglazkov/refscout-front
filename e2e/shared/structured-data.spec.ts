import { expect, test } from "@playwright/test";

/**
 * What a crawler is told about the product, on the two addresses that describe
 * it: the start page, which is the product, and the list of checks, which is
 * what it is made of.
 *
 * The block is data rather than code - the browser executes nothing in it - and
 * that is worth holding to: a `<` inside it would end the element early and
 * everything after it would be read as markup.
 */
const DESCRIBED = ["/", "/features/"];

for (const path of DESCRIBED) {
  test(`${path} declares the application in structured data`, async ({ page }) => {
    await page.goto(path);
    const blocks = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();

    expect(blocks).toHaveLength(1);
    const source = blocks[0] ?? "";
    expect(source).not.toContain("<");

    const data = JSON.parse(source) as Record<string, unknown>;
    expect(data["@context"]).toBe("https://schema.org");
    expect(data["@type"]).toBe("SoftwareApplication");
    expect(data["name"]).toBeTruthy();
    expect(data["description"]).toBeTruthy();
    // The one property that makes this a rich result rather than a fact nobody
    // asked for, and the reason the price lives in the table of rights.
    expect(data["offers"]).toMatchObject({ "@type": "Offer", priceCurrency: "USD" });
    expect(Array.isArray(data["featureList"])).toBe(true);
    expect((data["featureList"] as string[]).length).toBeGreaterThan(0);
  });
}

test("no other page claims to be the application", async ({ page }) => {
  // Every address describing itself as the same application is the same page
  // declared several times, and a crawler is entitled to pick whichever it
  // likes as the one to show.
  for (const path of ["/pricing/", "/privacy/"]) {
    await page.goto(path);
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
  }
});
