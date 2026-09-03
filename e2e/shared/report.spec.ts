import { expect, test } from "@playwright/test";

/**
 * Saying that something is wrong, from a real browser.
 *
 * Two claims are checked here that no unit test reaches. The control is on
 * every page and not only on the working screen, because the moment somebody
 * notices a fault is not reliably the moment the product noticed one. And what
 * the form shows before it sends is what leaves: the request is read off the
 * wire, so a field the person unticked is checked against the body rather than
 * against the checkbox.
 */
test.describe("reporting a problem", () => {
  test("is reachable from the footer of an ordinary page of the site", async ({
    page,
  }) => {
    await page.goto("/privacy/");

    await page.getByTestId("report-problem").click();
    const form = page.getByTestId("report-dialog");
    await expect(form).toBeVisible();

    // Every field with the value it holds. "We sent something about your
    // session" and "here is exactly what we will send" are conversations of
    // different quality, and this product works with unpublished manuscripts.
    await expect(form.getByTestId("report-part-release")).toBeVisible();
    await expect(form.getByTestId("report-part-route")).toBeVisible();
    await expect(form.getByTestId("report-part-events")).toBeVisible();
  });

  test("sends what was left ticked, and nothing that was not", async ({ page }) => {
    const bodies: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/client-events")) bodies.push(request.postData() ?? "");
    });

    await page.goto("/");
    /*
     * The working screen is loaded on demand and brings the mock server with
     * it, so the report has somewhere to go only once it is up. The wait is
     * generous on purpose: this file also runs in the second engine, where the
     * first paint of that screen under several parallel contexts takes longer
     * than the default allows, and a timeout there would be a report of the
     * test runner's load rather than of anything in the product.
     */
    await expect(page.getByTestId("drop-zone")).toBeVisible({ timeout: 20_000 });

    // The combination works wherever the person is, so that a screen wrong in a
    // way no exception describes is still reportable without hunting for a
    // control.
    await page.keyboard.press("Alt+Shift+KeyR");
    const form = page.getByTestId("report-dialog");
    await expect(form).toBeVisible();

    await form.getByTestId("report-part-route").click();
    await form
      .getByTestId("report-message")
      .fill("the list showed one more reference than the file had");
    await form.getByTestId("report-send").click();

    // The identifier of the case, and it stays on screen: it is what a person
    // quotes to support.
    await expect(form.getByTestId("report-id")).not.toBeEmpty();

    const sent = bodies
      .map((body) => JSON.parse(body) as { events: { kind: string; route: string }[] })
      .flatMap((batch) => batch.events)
      .find((event) => event.kind === "user_report");
    expect(sent).toBeDefined();
    expect(sent?.route).toBe("");
  });
});
