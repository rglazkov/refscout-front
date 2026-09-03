import { expect, test, type Page } from "@playwright/test";

/**
 * Any violation of the policy fails the test. Without that the policy is
 * quietly weakened by the first inconvenient case: somebody adds
 * 'unsafe-inline' to script-src to "make it work for now", and nobody
 * notices.
 */
function collectViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
  });
  void page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const detail = `${event.violatedDirective}: ${event.blockedURI}`;
      console.error(`Content Security Policy violation - ${detail}`);
    });
  });
  return violations;
}

const pages = ["/", "/features/", "/pricing/", "/account/"];

for (const path of pages) {
  test(`page ${path} violates no CSP directive`, async ({ page }) => {
    const violations = collectViolations(page);
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });
}

test("popovers violate no CSP directive", async ({ page }) => {
  const violations = collectViolations(page);
  // A width below the breakpoint: the menu button is there, and with it the
  // popover that sets its coordinates through an inline style - the most
  // awkward case for the CSP.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("dialog").getByRole("link").first()).toBeVisible();
  await page.keyboard.press("Escape");
  expect(violations).toEqual([]);
});

test("the root is the default language, copied there by the build", async ({
  request,
}) => {
  // Every language is generated under its own prefix, and the unprefixed root
  // is a post-build copy of the default one. Nothing in the router produces it,
  // so nothing but a check like this notices when it stops happening - and what
  // stops working is the address most people arrive on.
  for (const path of ["/", "/features/", "/privacy/"]) {
    const prefixed = path === "/" ? "/en/" : `/en${path}`;
    const [root, underPrefix] = await Promise.all([
      request.get(path),
      request.get(prefixed),
    ]);

    expect(root.status()).toBe(200);
    expect(underPrefix.status()).toBe(200);
    expect(await root.text()).toBe(await underPrefix.text());
  }
});

test("the security headers arrive with every page", async ({ request }) => {
  for (const path of pages) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");

    // Where a violation is posted, declared under both names so that every live
    // browser reports. Without this the policy is only ever checked here, on
    // our own code, and breaks silently at the user's end.
    expect(headers["content-security-policy"]).toContain("report-uri https://");
    expect(headers["content-security-policy"]).toContain("report-to csp");
    expect(headers["reporting-endpoints"]).toMatch(/^csp="https:\/\//);
  }
});

test("the payment origin is allowed on the pricing page and nowhere else", async ({
  request,
}) => {
  // The wider set exists for the payment widget, and it is confined to the one
  // address that needs it. One relaxed policy over the whole application would
  // take the protection off the screen the manuscripts are on.
  const pricing = (await request.get("/pricing/")).headers()["content-security-policy"];
  expect(pricing).toContain("https://js.stripe.com");

  for (const path of ["/", "/features/", "/privacy/", "/account/"]) {
    const policy = (await request.get(path)).headers()["content-security-policy"];
    expect(policy).not.toContain("js.stripe.com");
    expect(policy).toContain("frame-src 'none'");
  }
});
