import { expect, test, type Page } from "@playwright/test";

/**
 * The path the product exists to produce: a manuscript, a buffer, the
 * bibliography brought in on the manuscript's own card, the text opened and
 * corrected, a run, progress, results, a finding marked as dealt with, and a
 * download.
 *
 * It runs against the mock, which serves the contract's own bodies from a
 * service worker in the tab - the same second source the fast tests use, and
 * the one the application cannot tell apart from the stand.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\bibliography{refs}
\\end{document}
`;

const BIBLIOGRAPHY = `@article{smith2019attention,
  title = {Attention Revisited},
  author = {Smith, Jane},
  year = {2019},
}
`;

async function dropManuscript(page: Page, name = "paper.tex"): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name,
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  // The card appears the moment the file is dropped and fills in as the text is
  // read, so the volume is what says the reading has finished.
  await expect(page.getByTestId("document-card")).toContainText("characters");
}

/**
 * The bibliography brought in on the manuscript's own card. This is one of the
 * two ways the pair is linked - the other is dropping the bibliography in as a
 * document of its own and naming the manuscript from it.
 */
async function attachBibliography(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Configure" }).click();
  await page.getByTestId("attach-input-bibcheck").setInputFiles({
    name: "refs.bib",
    mimeType: "text/plain",
    buffer: Buffer.from(BIBLIOGRAPHY, "utf8"),
  });
  await expect(page.getByTestId("attachment-bibcheck")).toContainText("refs.bib");
}

test.describe("from a file to a downloaded report", () => {
  test("the whole path", async ({ page }) => {
    /*
     * Every request the page makes, so the claim that nothing leaves before the
     * button can be checked rather than asserted in prose.
     */
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.goto("/");
    await dropManuscript(page);

    // Read from the content rather than from the extension: a .tex that names a
    // bibliography arrives with BibCheck ticked.
    await expect(page.getByTestId("check-bibcheck")).toHaveAttribute(
      "data-state",
      "checked",
    );
    await expect(page.getByTestId("check-glossary")).toHaveAttribute(
      "data-state",
      "unchecked",
    );

    // The plan belongs to this document and sits on its card, and it says the
    // check will run without the text it was meant to read.
    await expect(page.getByTestId("check-plan")).toContainText("BibCheck");
    await expect(page.getByTestId("plan-incomplete")).toContainText(
      "BibCheck will run, but",
    );

    // The buffer counts two things in two sentences.
    await expect(page.getByTestId("buffer-counts")).toContainText("In the buffer: 1");
    await expect(page.getByTestId("sending-counts")).toContainText("Will be sent: 1");

    await attachBibliography(page);

    // The bibliography is not a second row in the buffer, and it does go with
    // the manuscript when the job leaves.
    await expect(page.getByTestId("document-card")).toHaveCount(1);
    await expect(page.getByTestId("buffer-counts")).toContainText("In the buffer: 1");
    await expect(page.getByTestId("sending-counts")).toContainText("Will be sent: 2");
    await expect(page.getByTestId("plan-incomplete")).toHaveCount(0);

    // Up to this point the network has seen nothing of the document.
    expect(requests.filter((url) => url.includes("/jobs"))).toEqual([]);

    // The bibliography is another text than the manuscript, so it has an editor
    // of its own - which is the only place either of them is downloaded from.
    await page.getByTestId("attachment-open-bibcheck").click();
    await expect(page.getByTestId("editor")).toContainText("smith2019attention");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "paper.tex", exact: true }).click();
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
    // One document was checked. The bibliography travelled with it and has no
    // results of its own, so it is not a heading here.
    await expect(page.getByTestId("document-results")).toHaveCount(1);

    // The visible name is a pointer target, while the one labelled editor
    // button is the only duplicate action in the Tab order.
    const resultName = page.getByTestId("document-name-open");
    await expect(resultName).toHaveText("paper.tex");
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
    // The scale is named, not turned into a percentage.
    await expect(card).toContainText(/\d+\/100/);
    await expect(card).not.toContainText(/notes/);
    await card.getByRole("button", { name: /Open \(/ }).click();

    // A finding is opened, and marked as dealt with. The mark never leaves the
    // browser.
    const finding = page.getByRole("button", { name: /retracted/i }).first();
    // Before it is opened the row already says where it is, in the words
    // available without a highlight: the entry of the bibliography it names,
    // and how many places it has.
    await expect(page.getByTestId("issue-bibkey").first()).toHaveText(
      "smith2019attention",
    );
    await expect(page.getByTestId("issue-occurrences").first()).toContainText("3");
    await finding.click();
    /*
     * And the third way of naming a place: the sentence the module was reading.
     * Which sentence that is belongs to the document rather than to the check -
     * the stand-in answers about the manuscript it was actually given, and its
     * places are cut from that text - so what is asked here is that the row
     * quotes this document and not somebody else's.
     */
    const quote = page.getByTestId("issue-quote").first();
    await expect(quote).toBeVisible();
    const quoted = (await quote.textContent()) ?? "";
    expect(quoted.length).toBeGreaterThan(0);
    expect(MANUSCRIPT).toContain(quoted);

    const fixed = page.getByRole("button", { name: "Fixed" }).first();
    await fixed.click();
    await expect(fixed).toHaveAttribute("aria-pressed", "true");

    // The other mark says something else - "the check is right and I do not
    // want it" - so pressing it clears the first rather than adding to it.
    const ignore = page.getByTestId("ignore-issue").first();
    await ignore.click();
    await expect(ignore).toHaveAttribute("aria-pressed", "true");
    await expect(fixed).toHaveAttribute("aria-pressed", "false");

    // The file a check wrote is another text again, so it opens in an editor of
    // its own rather than being handed over as a download from the card.
    await page.getByTestId("open-artifact").first().click();
    await expect(page.getByTestId("editor")).toBeVisible();
    await expect(page.getByTestId("download-document")).toBeVisible();
    await page.keyboard.press("Escape");

    // Download on this screen is one action and makes one file: the report.
    const [report] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-report").first().click(),
    ]);
    expect(report.suggestedFilename()).toBe("refscout-findings.md");

    // Only one job was ever created, whatever else the screen did.
    const created = requests.filter((url) => /\/jobs$/.test(url));
    expect(created).toHaveLength(1);
  });

  test("Cite opens over the page, and the sources kept become a .bib", async ({
    page,
  }) => {
    await page.goto("/");
    await dropManuscript(page);
    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

    // Cite proposes sources rather than reporting anything wrong, and reading
    // one source is a screenful, so its card opens over the page instead of
    // unfolding in the grid.
    await page.getByTestId("open-cite").click();
    const overlay = page.getByTestId("cite-overlay");
    await expect(overlay).toBeVisible();
    // A claim is named by the sentence it was made in, and that sentence comes
    // out of the manuscript that was sent rather than out of the check.
    const claim = overlay.getByTestId("cite-claim").first().locator("p").first();
    await expect(claim).toBeVisible();
    const claimed = (await claim.textContent()) ?? "";
    expect(claimed.length).toBeGreaterThan(0);
    expect(MANUSCRIPT).toContain(claimed);

    // The first one offered is a source the manuscript does not already cite:
    // the ones it does are folded away under "Already cited".
    const candidate = overlay.getByTestId("cite-candidate").first();
    await expect(candidate).toContainText("Long Range Arena");
    await candidate.getByTestId("cite-use").click();
    await expect(candidate).toHaveAttribute("data-accepted", "true");

    // What the reading was for: the accepted sources are assembled in the
    // browser and opened in the editor, which is where a file is saved from.
    await overlay.getByTestId("cite-export").click();
    const editor = page.getByTestId("editor");
    await expect(editor).toBeVisible();
    await expect(editor).toContainText("Long Range Arena");
    await expect(page.getByTestId("download-document")).toBeVisible();
  });

  test("the text that is edited is the text that is sent", async ({ page }) => {
    await page.goto("/");
    await dropManuscript(page);

    // Read off the request itself rather than through `page.route`: the mock
    // answers from a service worker, so nothing reaches the network layer an
    // interceptor sits on - while the request the page made is still visible.
    let sent = "";
    page.on("request", (request) => {
      if (/\/jobs$/.test(request.url())) sent = request.postData() ?? "";
    });

    await page.getByRole("button", { name: "paper.tex", exact: true }).click();
    await page.getByTestId("editor").getByRole("textbox").click();
    await page.keyboard.type("% edited by hand\n");
    await page.keyboard.press("Escape");

    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

    // The edit is applied to the buffer itself, not to a copy made for viewing.
    expect(sent).toContain("edited by hand");
  });

  test("a document with no ticks drops out of the plan and says why", async ({
    page,
  }) => {
    await page.goto("/");
    // Prose with no markup at all: nothing is proposed on it, so it is in the
    // buffer and not in the run.
    await page.getByTestId("file-input").setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Some notes with nothing to go on.\n", "utf8"),
    });
    await expect(page.getByTestId("document-card")).toHaveCount(1);

    await expect(page.getByTestId("plan-exclusions")).toContainText("no checks ticked");
    await expect(page.getByTestId("sending-counts")).toContainText("Will be sent: 0");

    // A button that cannot run is not made `disabled`: it says why when it is
    // pressed.
    const blocked = page.getByRole("button", { name: /Run the check/ });
    await expect(blocked).toHaveAttribute("aria-disabled", "true");

    /*
     * And it sits where a button sits. The reason is written into a live region
     * that is always in the tree, so that a press fills a region the screen
     * reader was already watching - but until it has something to say it takes
     * no room. Held open, its gap pushed the button off the centre of the row
     * by half of itself, which looked like a rendering fault and was ours.
     */
    const offset = await blocked.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const around = node.parentElement?.getBoundingClientRect();
      return around === undefined
        ? null
        : { above: box.top - around.top, below: around.bottom - box.bottom };
    });
    expect(offset).toEqual({ above: 0, below: 0 });
    // Forced because the driver treats `aria-disabled` as unclickable, which is
    // the opposite of the point: the control stays focusable and answers when
    // it is pressed, and a person can press it. Forcing also skips the check
    // that the element has stopped moving, and the buffer unfolds with a
    // motion, so the press is retried until it lands.
    await expect(async () => {
      await blocked.click({ force: true });
      await expect(page.getByRole("status")).toContainText("Nothing to send");
    }).toPass({ timeout: 10_000 });
  });

  test("a key written twice is named on the card, before anything is sent", async ({
    page,
  }) => {
    /*
     * The bibliography is read here as well as sent, and a duplicate key is
     * visible in the file itself - so it is said now, on the card, rather than
     * after a check has run. It changes nothing else: the ticks stand, the plan
     * stands, and the run button is exactly as it was.
     */
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "refs.bib",
      mimeType: "text/plain",
      buffer: Buffer.from(BIBLIOGRAPHY + BIBLIOGRAPHY, "utf8"),
    });

    const card = page.getByTestId("document-card");
    await expect(card).toContainText("Two entries share the key");
    await expect(card).toContainText("smith2019attention");
    await expect(page.getByTestId("run")).toBeEnabled();

    // And it goes when the cause goes. The reading is redone over the text as
    // it now stands, so a warning cannot outlive the thing it was about.
    await page.getByRole("button", { name: "refs.bib", exact: true }).click();
    const editor = page.getByTestId("editor");
    await expect(editor).toBeVisible();
    await editor.getByRole("textbox").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.keyboard.type("@article{only2019,\n  title = {One entry},\n");
    await page.keyboard.press("Escape");

    await expect(card).not.toContainText("Two entries share the key", {
      timeout: 15_000,
    });
  });

  test("a bibliography on its own is a document, and it names its manuscript", async ({
    page,
  }) => {
    /*
     * The other way round from the path above, and the reason both exist. A
     * person who brought only a bibliography has a document to check: duplicate
     * keys, broken entries and retracted works are answerable without any
     * manuscript. When they bring the manuscript too, the pair is linked from
     * whichever card they happen to be looking at.
     */
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "refs.bib",
      mimeType: "text/plain",
      buffer: Buffer.from(BIBLIOGRAPHY, "utf8"),
    });

    await expect(page.getByTestId("document-card")).toHaveCount(1);
    await expect(page.getByTestId("check-bibcheck")).toHaveAttribute(
      "data-state",
      "checked",
    );
    await expect(page.getByTestId("sending-counts")).toContainText("Will be sent: 1");

    // With nothing else in the buffer the slot has nothing to offer from it, so
    // it asks for a file.
    await page.getByRole("button", { name: "Configure" }).click();
    await expect(page.getByTestId("settings-bibcheck")).toContainText(
      "The manuscript that cites this bibliography",
    );
    await expect(page.getByTestId("companion-select-bibcheck")).toHaveCount(0);

    // Now the manuscript arrives as a document in its own right, and the
    // bibliography can name it without either of them losing its card.
    await page.getByTestId("file-input").setInputFiles({
      name: "paper.tex",
      mimeType: "text/plain",
      buffer: Buffer.from(MANUSCRIPT, "utf8"),
    });
    await expect(page.getByTestId("document-card")).toHaveCount(2);

    // By the card's own name button: the other card now lists refs.bib among
    // the documents its own BibCheck could read, so matching on text alone
    // matches both.
    const bibCard = page
      .getByTestId("document-card")
      .filter({ has: page.getByRole("button", { name: "refs.bib", exact: true }) });
    await bibCard.getByTestId("companion-select-bibcheck").click();
    await page.getByRole("option", { name: "paper.tex" }).click();
    await expect(bibCard.getByTestId("attachment-bibcheck")).toContainText("paper.tex");

    // Naming it does not consume it: it is still a document of the buffer with
    // its own ticks, and it is counted once.
    await expect(page.getByTestId("document-card")).toHaveCount(2);
    await expect(page.getByTestId("buffer-counts")).toContainText("In the buffer: 2");
    await expect(page.getByTestId("sending-counts")).toContainText("Will be sent: 2");

    // And unnaming it leaves the manuscript alone - it was never this card's to
    // destroy.
    await bibCard.getByTestId("attachment-clear-bibcheck").click();
    await expect(page.getByTestId("document-card")).toHaveCount(2);
  });

  test("a file we do not read is refused with a way out", async ({ page }) => {
    // A refusal of intake, as against a failure of extraction: this one never
    // becomes a document, so there is no card for it to carry a reason on and
    // the reason goes beside the drop zone instead.
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "slides.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer: Buffer.from("PKbinary", "utf8"),
    });

    await expect(page.getByTestId("intake-refusals")).toContainText("pptx");
    await expect(page.getByTestId("document-card")).toHaveCount(0);
  });

  test("removing a document asks in a dialogue, not in a strip on the card", async ({
    page,
  }) => {
    await page.goto("/");
    await dropManuscript(page);

    await page.getByRole("button", { name: "Remove paper.tex" }).click();
    const dialog = page.getByTestId("remove-confirm");
    await expect(dialog).toBeVisible();
    // Esc is one of the two answers, and it is the safe one.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("document-card")).toHaveCount(1);

    await page.getByRole("button", { name: "Remove paper.tex" }).click();
    await page.getByTestId("remove-confirm").getByTestId("confirm-destructive").click();
    await expect(page.getByTestId("document-card")).toHaveCount(0);
  });

  test("the interface says plainly that a reload loses the buffer", async ({ page }) => {
    // Storage that survives a reload is not built yet. Until it exists the
    // honest sentence is what the screen owes the person.
    await page.goto("/");
    await dropManuscript(page);
    await expect(page.getByTestId("volatile-notice")).toContainText("Reloading");
  });
});
