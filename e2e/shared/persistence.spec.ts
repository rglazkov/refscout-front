import { expect, test, type Page } from "@playwright/test";

import { READING_MS } from "../support/reading";

/**
 * The transitions that must not lose anything, one test per row of the table
 * they were written as.
 *
 * The table is not a formality. It lists exactly the moves on which state goes
 * missing in ordinary applications - a second file dropped on a full buffer, an
 * overlay closed, a page left and returned to, a reload - and here every one of
 * them would destroy the only copy of somebody's manuscript. The file on disk
 * has been read and let go, and nothing was ever sent anywhere.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\end{document}
`;

async function drop(page: Page, name: string): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  await expect(page.getByTestId("document-card").filter({ hasText: name })).toContainText(
    "characters",
    { timeout: READING_MS },
  );
}

/**
 * Opens a document's text and types into it. The name on the card is the way
 * in; "Done" closes the overlay and confirms nothing, because every keystroke
 * was applied and written as it was made.
 */
async function correct(page: Page, name: string, text: string): Promise<void> {
  await page.getByRole("button", { name, exact: true }).click();
  await expect(page.getByTestId("editor")).toBeVisible({ timeout: READING_MS });
  await page.getByTestId("editor").getByRole("textbox").click();
  await page.keyboard.type(text);
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
}

/** Types into the paste overlay and closes it without adding anything. */
async function typeDraft(page: Page, text: string): Promise<void> {
  await page.getByRole("button", { name: "Paste text" }).click();
  const overlay = page.getByRole("dialog");
  await overlay.getByRole("textbox").click();
  await page.keyboard.type(text);
  await overlay.getByRole("button", { name: "Close" }).click();
}

test.describe("working with the buffer", () => {
  test("a second file joins the list instead of replacing it", async ({ page }) => {
    await page.goto("/");
    await drop(page, "first.tex");
    await page.getByTestId("check-presubmit").click();

    await drop(page, "second.tex");

    await expect(page.getByTestId("document-card")).toHaveCount(2);
    // The drop zone is a zone of the same screen and stands above the list: a
    // way to bring the next document in must never take the list away.
    await expect(page.getByTestId("drop-zone")).toBeVisible();
    await expect(page.getByTestId("check-presubmit").first()).toHaveAttribute(
      "data-state",
      "unchecked",
    );
  });

  test("a file dropped while something is typed keeps both", async ({ page }) => {
    await page.goto("/");
    await typeDraft(page, "half a paragraph nobody has added yet");
    await drop(page, "paper.tex");

    await expect(page.getByTestId("document-card")).toHaveCount(1);
    await page.getByRole("button", { name: "Paste text" }).click();
    await expect(page.getByRole("dialog")).toContainText("half a paragraph");
  });
});

test.describe("overlays", () => {
  test("closing the paste overlay keeps the draft", async ({ page }) => {
    await page.goto("/");
    await typeDraft(page, "typed and not yet added");

    await page.getByRole("button", { name: "Paste text" }).click();
    // "Done" closes the overlay; it does not confirm anything, and a draft that
    // vanished on closing would be text nobody can get back.
    await expect(page.getByRole("dialog")).toContainText("typed and not yet added");
  });

  test("closing the editor keeps the correction", async ({ page }) => {
    await page.goto("/");
    await drop(page, "paper.tex");

    await correct(page, "paper.tex", "A sentence added by hand. ");

    await page.getByRole("button", { name: "paper.tex", exact: true }).click();
    await expect(page.getByTestId("editor")).toContainText("A sentence added by hand.");
  });

  test("correcting the text leaves ticks set by hand alone", async ({ page }) => {
    await page.goto("/");
    await drop(page, "paper.tex");

    await page.getByTestId("check-glossary").click();
    await expect(page.getByTestId("check-glossary")).toHaveAttribute(
      "data-state",
      "checked",
    );

    await correct(page, "paper.tex", "\\glossary{}");

    // The automatic proposal suggests and never overrules: once somebody has
    // touched the ticks, a recount goes round this document.
    await expect(page.getByTestId("check-glossary")).toHaveAttribute(
      "data-state",
      "checked",
    );
  });
});

test.describe("leaving the page and coming back", () => {
  test("a reload finds the buffer, the correction and the draft where they were", async ({
    page,
  }) => {
    await page.goto("/");
    await drop(page, "paper.tex");

    await correct(page, "paper.tex", "Corrected before the reload. ");

    await typeDraft(page, "a draft that must survive");

    await page.reload();

    await expect(page.getByTestId("document-card")).toHaveCount(1, {
      timeout: READING_MS,
    });
    await page.getByRole("button", { name: "paper.tex", exact: true }).click();
    await expect(page.getByTestId("editor")).toContainText(
      "Corrected before the reload.",
      { timeout: READING_MS },
    );
    await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

    await page.getByRole("button", { name: "Paste text" }).click();
    await expect(page.getByRole("dialog")).toContainText("a draft that must survive");
  });

  test("a walk to the pricing page and back changes nothing", async ({ page }) => {
    await page.goto("/");
    await drop(page, "paper.tex");

    await page.goto("/pricing/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.goto("/");

    await expect(page.getByTestId("document-card")).toHaveCount(1, {
      timeout: READING_MS,
    });
  });

  test("the buffer survives a run being cancelled", async ({ page }) => {
    await page.goto("/");
    await drop(page, "paper.tex");
    await page.getByTestId("run").click();

    await page.getByRole("button", { name: /Cancel/i }).click();
    await expect(page.getByTestId("document-card")).toHaveCount(1);
  });
});

test.describe("the boundaries of the storage", () => {
  test("an empty store is an ordinary empty screen, not a fault", async ({ page }) => {
    await page.goto("/");
    // The same wait as a document being read, and for the same kind of reason:
    // the screen arrives with its own chunk and waits for the database to be
    // read back before it draws anything.
    await expect(page.getByTestId("drop-zone")).toBeVisible({ timeout: READING_MS });
    await expect(page.getByTestId("document-card")).toHaveCount(0);
    await expect(page.getByTestId("storage-unavailable")).toHaveCount(0);
  });

  test("deleting the saved documents empties the browser at once", async ({ page }) => {
    await page.goto("/");
    await drop(page, "paper.tex");

    await page.getByTestId("delete-saved").click();
    await page.getByTestId("delete-saved-dialog").getByText("Delete everything").click();

    await expect(page.getByTestId("document-card")).toHaveCount(0, {
      timeout: READING_MS,
    });

    // Read from the database rather than from the screen: a list that merely
    // stopped being drawn would pass a test and leave the manuscript behind.
    const held = await page.evaluate(async () => {
      const open = indexedDB.open("refscout");
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(new Error("the database would not open"));
      });
      const rows = await new Promise<number>((resolve) => {
        const request = database
          .transaction("documents", "readonly")
          .objectStore("documents")
          .count();
        request.onsuccess = () => resolve(request.result);
      });
      database.close();
      return rows;
    });
    expect(held).toBe(0);
  });

  test("a browser with no storage works and says so", async ({ browser }) => {
    const context = await browser.newContext();
    // Taken away before a line of the application has run, which is what a
    // private window looks like from inside the tab.
    await context.addInitScript(() => {
      Object.defineProperty(window, "indexedDB", { value: undefined });
    });
    const page = await context.newPage();

    await page.goto("/");
    await drop(page, "paper.tex");

    // Working, and honest about it: the text is on screen, the card is drawn,
    // and the sentence says this will not survive a reload.
    await expect(page.getByTestId("storage-unavailable")).toBeVisible({
      timeout: READING_MS,
    });
    await expect(page.getByTestId("document-card")).toHaveCount(1);
    await context.close();
  });
});

test.describe("a second tab", () => {
  test("shows the curtain, and gives the work back on one press", async ({ browser }) => {
    // One context, because two tabs of one browser share an origin and a lock -
    // two contexts would be two browsers and would not race at all.
    const context = await browser.newContext();
    const first = await context.newPage();
    await first.goto("/");
    await drop(first, "paper.tex");

    const second = await context.newPage();
    await second.goto("/");

    await expect(second.getByTestId("other-tab")).toBeVisible();
    await expect(first.getByTestId("drop-zone")).toBeVisible();

    await second.getByTestId("work-here").click();

    await expect(second.getByTestId("drop-zone")).toBeVisible();
    await expect(first.getByTestId("other-tab")).toBeVisible();
    // The buffer went with the role: the manuscript is one, and so is the tab
    // that may write to it.
    await expect(second.getByTestId("document-card")).toHaveCount(1, {
      timeout: READING_MS,
    });

    await context.close();
  });

  test("closing the owning tab gives the role back without anybody asking", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const first = await context.newPage();
    await first.goto("/");
    await expect(first.getByTestId("drop-zone")).toBeVisible();

    const second = await context.newPage();
    await second.goto("/");
    await expect(second.getByTestId("other-tab")).toBeVisible();

    // The browser releases the lock, not us: a tab that closed, crashed or was
    // killed in the background all end the same way, which is the whole reason
    // ownership is a lock rather than an agreement over messages.
    await first.close();

    await expect(second.getByTestId("drop-zone")).toBeVisible();
    await context.close();
  });
});
