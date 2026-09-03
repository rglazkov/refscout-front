import { expect, test, type Page } from "@playwright/test";

/**
 * The two modes of the working screen: a search, and a comparison of two
 * versions.
 *
 * Three claims about them are only answerable in a browser. A search leaves on
 * a press and not on a keystroke, and narrowing the answer afterwards reaches
 * nobody. A comparison of two real files makes no request at all - it has
 * nothing to send. And going into a mode and coming back leaves the buffer
 * exactly as it was, which is the whole reason a mode is a mode and not a page.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\end{document}
`;

const BEFORE = `\\section{Method}
Dense retrieval is usually left to a frozen encoder.
The corpus was read in full.
`;

const AFTER = `\\section{Method}
Dense retrieval is rarely left to a frozen encoder.
The corpus was read in full.
`;

/** Every request the page makes, so "nothing was sent" is a list and not a claim. */
function watch(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  return requests;
}

function apiCalls(requests: readonly string[]): string[] {
  return requests.filter((url) => /\/(scout|jobs|entitlements|venues)\b/.test(url));
}

test.describe("searching for sources", () => {
  test("the query leaves on a press, and the filters leave nothing", async ({ page }) => {
    await page.goto("/");
    const requests = watch(page);

    await page.getByTestId("enter-scout").click();
    await expect(page.getByTestId("scout-screen")).toBeVisible();

    // Typing is not searching: what is in the box is the person's, until they
    // say otherwise.
    await page.getByTestId("scout-query").fill("attention");
    expect(apiCalls(requests).filter((url) => url.includes("/scout/search"))).toEqual([]);

    await page.getByTestId("scout-run").click();
    await expect(page.getByTestId("scout-result").first()).toBeVisible();
    const afterSearch = apiCalls(requests).filter((url) =>
      url.includes("/scout/search"),
    ).length;
    expect(afterSearch).toBe(1);

    // The panel of controls arrives with the results it acts on.
    await page.getByTestId("scout-filters-toggle").click();
    await page.getByTestId("scout-min-citations").fill("1000000");
    await expect(page.getByTestId("scout-empty")).toBeVisible();
    await page.getByTestId("scout-min-citations").fill("");
    await expect(page.getByTestId("scout-result").first()).toBeVisible();

    expect(apiCalls(requests).filter((url) => url.includes("/scout/search")).length).toBe(
      afterSearch,
    );
  });

  test("a number is stepped by one, and keeps going while the button is held", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("enter-scout").click();
    await page.getByTestId("scout-query").fill("attention");
    await page.getByTestId("scout-run").click();
    await expect(page.getByTestId("scout-result").first()).toBeVisible();
    await page.getByTestId("scout-filters-toggle").click();

    const field = page.getByTestId("scout-min-citations");
    const more = page.getByRole("button", { name: "One more: Minimum citations" });

    /*
     * Held down, it keeps going: thirty is not a number anybody should reach by
     * tapping thirty times. The press is sent as pointer events rather than
     * through the mouse, because that is the one way to hold a control down on
     * both a pointer and a touch screen from here.
     */
    await more.dispatchEvent("pointerdown", { button: 0, pointerId: 1, isPrimary: true });
    await page.waitForTimeout(1200);
    await more.dispatchEvent("pointerup", { button: 0, pointerId: 1, isPrimary: true });

    const reached = Number(await field.inputValue());
    expect(reached).toBeGreaterThan(5);

    // And it stops when the button is let go.
    await page.waitForTimeout(300);
    expect(Number(await field.inputValue())).toBe(reached);

    // A press on its own is one step, however long the last one lasted.
    await more.click();
    expect(Number(await field.inputValue())).toBe(reached + 1);
  });

  test("a partial answer says which databases were missing", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("enter-scout").click();
    await page.getByTestId("scout-query").fill("attention");
    await page.getByTestId("scout-run").click();

    await expect(page.getByTestId("scout-sources")).toContainText("did not answer");
  });
});

test.describe("comparing two versions", () => {
  test("a pair is compared, edited and exported without a single request", async ({
    page,
  }) => {
    await page.goto("/");
    // The screen has fetched what it fetches before the mode is entered.
    await expect(page.getByTestId("drop-zone")).toBeVisible();
    const requests = watch(page);

    await page.getByTestId("enter-diff").click();
    await expect(page.getByTestId("diff-screen")).toBeVisible();

    await page
      .getByTestId("diff-pane-input")
      .first()
      .setInputFiles({
        name: "paper_v6.tex",
        mimeType: "text/plain",
        buffer: Buffer.from(BEFORE, "utf8"),
      });
    await page
      .getByTestId("diff-pane-input")
      .nth(1)
      .setInputFiles({
        name: "paper_v7.tex",
        mimeType: "text/plain",
        buffer: Buffer.from(AFTER, "utf8"),
      });

    const panes = page.getByTestId("merge-panes");
    await expect(panes).toBeVisible();
    await expect(page.getByTestId("diff-summary")).toContainText("change");

    // Both panes are editors, and both take an edit.
    const right = panes.locator(".cm-merge-b .cm-content");
    await right.click();
    await page.keyboard.type("x");
    await expect(right).toContainText("x");

    const download = page.waitForEvent("download");
    await page.getByTestId("diff-export").click();
    expect((await download).suggestedFilename()).toBe("paper_v7.tex");

    expect(apiCalls(requests)).toEqual([]);
  });

  test("going into a mode and back leaves the buffer alone", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "paper.tex",
      mimeType: "text/plain",
      buffer: Buffer.from(MANUSCRIPT, "utf8"),
    });
    await expect(page.getByTestId("document-card")).toContainText("characters");

    // With a document in the buffer the two entries are gone: the person came
    // to check a manuscript, and a control that replaces the working area
    // beside it reads as a threat to it.
    await expect(page.locator("#mode-entries")).toHaveAttribute("aria-hidden", "true");

    await page.getByRole("button", { name: "Remove paper.tex" }).click();
    await page.getByTestId("remove-confirm").getByTestId("confirm-destructive").click();
    await expect(page.getByTestId("document-card")).toHaveCount(0);

    await page.getByTestId("enter-diff").click();
    await expect(page.getByTestId("diff-screen")).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByTestId("drop-zone")).toBeVisible();
  });
});
