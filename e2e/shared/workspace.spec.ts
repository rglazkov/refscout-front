import { expect, test, type Page } from "@playwright/test";

/**
 * The path the whole milestone exists to produce (M1): a file, a buffer, the
 * text opened and corrected, a run, progress, results, a finding marked as
 * dealt with, and a download.
 *
 * It runs against the mock, which serves the contract's own bodies from a
 * service worker in the tab - the same second source the fast tests use, and
 * the one the application cannot tell apart from the stand (M1.7.6).
 */
const BIBLIOGRAPHY = `@article{smith2019attention,
  title = {Attention Revisited},
  author = {Smith, Jane},
  year = {2019},
}
`;

async function dropBibliography(page: Page, name = "refs.bib"): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(BIBLIOGRAPHY, "utf8"),
  });
  await expect(page.getByTestId("document-card")).toHaveCount(1);
}

test.describe("from a file to a downloaded report", () => {
  test("the whole path", async ({ page }) => {
    /*
     * Every request the page makes, so the claim that nothing leaves before the
     * button can be checked rather than asserted in prose (§7, §17).
     */
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.goto("/");
    await dropBibliography(page);

    // Read from the content rather than from the extension: a file beginning
    // with @article is a bibliography, so BibCheck arrives ticked (M1.4.2).
    await expect(page.getByTestId("check-bibcheck")).toHaveAttribute(
      "data-state",
      "checked",
    );
    await expect(page.getByTestId("check-glossary")).toHaveAttribute(
      "data-state",
      "unchecked",
    );

    // The buffer counts two things in two sentences (M1.4.9).
    await expect(page.getByTestId("buffer-counts")).toContainText("In the buffer: 1");
    await expect(page.getByTestId("sending-counts")).toContainText("Will be sent: 1");

    // Up to this point the network has seen nothing of the document.
    expect(requests.filter((url) => url.includes("/jobs"))).toEqual([]);

    await page.getByRole("button", { name: "refs.bib", exact: true }).click();
    const editor = page.getByTestId("editor");
    await expect(editor).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).toBeHidden();

    await page.getByTestId("run").click();

    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("results-totals")).toContainText(
      "Across all documents",
    );
    await expect(page.getByTestId("results-totals")).toContainText(
      "Scores are never averaged",
    );
    await expect(page.getByTestId("document-results")).toHaveCount(1);

    // The visible name is a pointer target like the prototype, while the one
    // labelled editor button is the only duplicate action in the Tab order.
    const resultName = page.getByTestId("document-name-open");
    await expect(resultName).toHaveText("refs.bib");
    await expect(resultName).not.toHaveAttribute("tabindex");
    await resultName.click();
    const resultEditor = page.getByTestId("editor");
    await expect(resultEditor).toBeVisible();
    await expect(resultEditor.getByRole("textbox")).toHaveAttribute(
      "contenteditable",
      "true",
    );
    await page.keyboard.press("Escape");

    const card = page.getByTestId("check-card").filter({ hasText: "BibCheck" });
    await expect(card).toBeVisible();
    // The scale is named, not turned into a percentage, as the prototype has it.
    await expect(card).toContainText(/\d+\/100/);
    await expect(card).not.toContainText(/notes/);
    await card.getByRole("button", { name: /Open/ }).click();

    // A finding is opened, and marked as dealt with. The mark never leaves the
    // browser (M1.9.4).
    const finding = page.getByRole("button", { name: /retracted/i }).first();
    await finding.click();
    const fixed = page.getByRole("button", { name: "Fixed" }).first();
    await fixed.click();
    await expect(fixed).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("download-menu").click();
    const [report] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-report").click(),
    ]);
    expect(report.suggestedFilename()).toBe("refscout-findings.md");

    // Only one job was ever created, whatever else the screen did (M1.9.5).
    const created = requests.filter((url) => /\/jobs$/.test(url));
    expect(created).toHaveLength(1);
  });

  test("the text that is edited is the text that is sent", async ({ page }) => {
    await page.goto("/");
    await dropBibliography(page);

    // Read off the request itself rather than through `page.route`: the mock
    // answers from a service worker, so nothing reaches the network layer an
    // interceptor sits on - while the request the page made is still visible.
    let sent = "";
    page.on("request", (request) => {
      if (/\/jobs$/.test(request.url())) sent = request.postData() ?? "";
    });

    await page.getByRole("button", { name: "refs.bib", exact: true }).click();
    await page.getByTestId("editor").getByRole("textbox").click();
    await page.keyboard.type("% edited by hand\n");
    await page.keyboard.press("Escape");

    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

    // The edit is applied to the buffer itself, not to a copy made for viewing
    // (M1.5.4).
    expect(sent).toContain("edited by hand");
  });

  test("a document with no ticks drops out of the plan and says why", async ({
    page,
  }) => {
    await page.goto("/");
    await dropBibliography(page);

    await page.getByTestId("check-bibcheck").click();
    await expect(page.getByTestId("plan-exclusions")).toContainText("no checks ticked");
    await expect(page.getByTestId("sending-counts")).toContainText("Will be sent: 0");

    // A button that cannot run is not made `disabled`: it says why when it is
    // pressed (§14).
    const blocked = page.getByRole("button", { name: /Run the check/ });
    await expect(blocked).toHaveAttribute("aria-disabled", "true");
    // Forced because the driver treats `aria-disabled` as unclickable, which is
    // the opposite of the point: the control stays focusable and answers when
    // it is pressed, and a person can press it.
    await blocked.click({ force: true });
    await expect(page.getByRole("status")).toContainText("Nothing to send");
  });

  test("a file we do not read yet is refused with a way out", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "thesis.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("PKbinary", "utf8"),
    });

    await expect(page.getByTestId("intake-refusals")).toContainText("docx");
    await expect(page.getByTestId("document-card")).toHaveCount(0);
  });

  test("the interface says plainly that a reload loses the buffer", async ({ page }) => {
    // Storage that survives a reload is M4. Until it exists the honest sentence
    // is what the screen owes the person (§6).
    await page.goto("/");
    await dropBibliography(page);
    await expect(page.getByTestId("volatile-notice")).toContainText("Reloading");
  });
});
