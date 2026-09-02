import { expect, test, type Page } from "@playwright/test";

/**
 * Pasting, and the draft that must not be lost.
 *
 * Typed text is not "a draft before it is added": it is an element of the
 * buffer like any other, and what is in the field before the button is pressed
 * is text the person wrote and cannot get back. So the rule is that nothing
 * loses it - not closing the overlay, not dropping a file beside it.
 */
async function paste(
  page: Page,
  content: { readonly text?: string; readonly html?: string; readonly file?: string },
): Promise<void> {
  // The working screen is loaded on demand, and the listener is its listener:
  // pasting into a page that has not mounted it yet tests nothing.
  await expect(page.getByTestId("drop-zone")).toBeVisible();
  await page.evaluate((payload) => {
    const data = new DataTransfer();
    if (payload.text !== undefined) data.setData("text/plain", payload.text);
    if (payload.html !== undefined) data.setData("text/html", payload.html);
    if (payload.file !== undefined) {
      data.items.add(new File([payload.file], "pasted.tex", { type: "text/plain" }));
    }
    // Chromium ignores `clipboardData` in the constructor - the real event
    // gets it from the browser - so it is put on the event by hand. What is
    // being tested is our handler, and the handler sees exactly this shape.
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });
    window.dispatchEvent(event);
  }, content);
}

test.describe("bringing text in without a file", () => {
  test("pasted text reaches the results by the same path a file does", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Paste text" }).click();

    const overlay = page.getByRole("dialog");
    await overlay.getByRole("textbox").click();
    await page.keyboard.type("\\documentclass{article}\nA manuscript typed by hand.");
    await overlay.getByRole("button", { name: "Add to buffer" }).click();

    // An element of the buffer like any other: a name, a volume, ticks of its
    // own, and the same road to the server.
    await expect(page.getByTestId("document-card")).toContainText("characters");
    await expect(page.getByTestId("check-presubmit")).toHaveAttribute(
      "data-state",
      "checked",
    );

    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 30_000 });
  });

  test("⌘V anywhere on the screen opens the overlay with the text in it", async ({
    page,
  }) => {
    await page.goto("/");
    await paste(page, { text: "@article{smith2019, title = {Pasted}}" });

    const overlay = page.getByRole("dialog");
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("Pasted");
  });

  test("a file in the clipboard is added as a file", async ({ page }) => {
    await page.goto("/");
    await paste(page, {
      file: "\\documentclass{article}\nBrought in through the clipboard.",
    });

    await expect(page.getByTestId("document-card")).toContainText("characters");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("copying from Word brings no markup into the application", async ({ page }) => {
    /*
     * Only `text/plain` is read. The HTML flavour of a copy out of Word carries
     * markup and external links, and markup accepted once will be in the DOM
     * sooner or later - the same zero trust the answers of the server get.
     */
    await page.goto("/");
    await paste(page, {
      text: "The sentence as it was written.",
      html: '<p class="MsoNormal">The sentence <img src="x" onerror="alert(1)"> written.</p>',
    });

    const overlay = page.getByRole("dialog");
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText("The sentence as it was written.");
    await expect(overlay).not.toContainText("MsoNormal");
    expect(await overlay.locator("img").count()).toBe(0);
  });
});

test.describe("the draft is not lost", () => {
  test("closing the overlay keeps it, and opening it again gives it back", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Paste text" }).click();
    const overlay = page.getByRole("dialog");
    await overlay.getByRole("textbox").click();
    await page.keyboard.type("Half a paragraph, typed and not yet added.");
    await overlay.getByRole("button", { name: "LaTeX" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Paste text" }).click();
    const reopened = page.getByRole("dialog");
    await expect(reopened).toContainText("Half a paragraph");
    // And the syntax the person chose, which is part of what they typed.
    await expect(reopened.getByRole("button", { name: "LaTeX" })).toHaveAttribute(
      "data-variant",
      "default",
    );
  });

  test("dropping a file beside a draft leaves the draft alone", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Paste text" }).click();
    await page.getByRole("dialog").getByRole("textbox").click();
    await page.keyboard.type("Typed, and not to be replaced by a file.");
    await page.keyboard.press("Escape");

    await page.getByTestId("file-input").setInputFiles({
      name: "paper.tex",
      mimeType: "text/plain",
      buffer: Buffer.from("\\documentclass{article}\nA dropped manuscript.\n", "utf8"),
    });
    await expect(page.getByTestId("document-card")).toContainText("characters");

    // The two paths are independent: there is a document, and the draft is
    // still what it was.
    await page.getByRole("button", { name: "Paste text" }).click();
    await expect(page.getByRole("dialog")).toContainText("not to be replaced by a file");
  });
});
