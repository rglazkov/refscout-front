import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The four claims the product makes about the editor and about downloading
 * that nothing else checks.
 *
 * All four are invisible on the happy path, which is exactly why they are
 * written down: a paste that smuggles markup in, an overlay a keyboard cannot
 * leave, a manuscript held in memory for the life of the tab and a saved file
 * that differs from the sent one all look like nothing at all on screen.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\end{document}
`;

/** The line that turns the fixture into a manuscript with a bibliography. */
const END = `\\end{document}`;
const BIB = `\\bibliography{refs}\n`;

async function dropManuscript(page: Page): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  // The card exists before its text does - reading happens in a worker - so the
  // volume is what says the document is ready to be opened.
  await expect(page.getByTestId("document-card")).toContainText("characters");
}

test.describe("the text overlay", () => {
  test("a pasted HTML fragment lands as text, not as markup", async ({ page }) => {
    await page.goto("/");
    await dropManuscript(page);

    await page.getByRole("button", { name: "paper.tex", exact: true }).click();
    const editor = page.getByTestId("editor");
    await expect(editor).toBeVisible();
    await editor.getByRole("textbox").click();

    /*
     * CodeMirror edits through `contenteditable`, so a paste carries whatever
     * the clipboard holds - and copying out of Word or a web page puts
     * `text/html` there beside the plain text. Only the plain half is taken:
     * anything accepted here reaches the DOM eventually.
     */
    await editor.getByRole("textbox").evaluate((node) => {
      const data = new DataTransfer();
      data.setData("text/plain", "% plain half\n");
      data.setData(
        "text/html",
        '<b onmouseover="alert(1)">bold half</b><img src="x" onerror="alert(1)">',
      );
      node.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await expect(editor).toContainText("% plain half");
    // The markup is not in the document, and no element of it reached the DOM.
    await expect(editor).not.toContainText("bold half");
    await expect(editor.locator("b, img")).toHaveCount(0);
  });

  test("the focus is locked inside, Esc closes, and the focus comes back", async ({
    page,
  }) => {
    await page.goto("/");
    await dropManuscript(page);

    const opener = page.getByRole("button", { name: "paper.tex", exact: true });
    await opener.click();
    const overlay = page.getByRole("dialog");
    await expect(overlay).toBeVisible();

    /*
     * Tab moves the focus on rather than inserting an indent - without that
     * there is no way out of an editor inside a modal overlay with the keyboard
     * and the overlay is a trap rather than a dialogue. Wherever it lands, it
     * lands inside: a modal that leaks the focus to the page behind it leaves a
     * person typing into a screen they cannot see.
     */
    for (let press = 0; press < 8; press += 1) {
      await page.keyboard.press("Tab");
      await expect(overlay.locator(":focus")).toHaveCount(1);
    }

    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();
    // And it comes back to the control it was opened from, rather than to the
    // top of the page with the buffer scrolled away underneath.
    await expect(opener).toBeFocused();
  });
});

/**
 * The text dissolves at an edge that hides more text. The rule the tests below
 * hold is that it dissolves nowhere else, because the mask dims the caret as
 * readily as it dims the letters - and the caret starts life on the first line,
 * which is the one edge that never hides anything.
 */
test.describe("the fade at the edges of the text", () => {
  /** Long enough that the field scrolls and the bottom edge does hide text. */
  const LONG = [
    "\\documentclass{article}",
    "\\begin{document}",
    ...Array.from(
      { length: 200 },
      (_, line) => `Line ${line + 1} of a manuscript long enough to scroll.`,
    ),
    "\\end{document}",
    "",
  ].join("\n");

  async function openLongManuscript(page: Page): Promise<void> {
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "long.tex",
      mimeType: "text/plain",
      buffer: Buffer.from(LONG, "utf8"),
    });
    await expect(page.getByTestId("document-card")).toContainText("characters");
    await page.getByRole("button", { name: "long.tex", exact: true }).click();
    await expect(page.getByTestId("editor")).toBeVisible();
    // The faces the field is set in arrive after it is drawn, and every line
    // moves by a fraction of a pixel when they land. Anything measured off the
    // screen below is measured once that has happened.
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
  }

  /**
   * A rectangle that has stopped moving. Read once, the caret's box can be the
   * one it had a frame ago - and a picture taken from that box is a picture of
   * the line above the caret rather than of the caret.
   */
  async function settled(target: Locator): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    let previous = "";
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const box = await target.boundingBox();
      if (box === null) throw new Error("the caret is on screen but has no box");
      const seen = `${box.x}:${box.y}:${box.height}`;
      if (seen === previous) return box;
      previous = seen;
      await target.page().waitForTimeout(50);
    }
    throw new Error("the caret never stopped moving");
  }

  /** The two distances the mask is drawn from, as the scroller carries them. */
  async function fade(page: Page): Promise<{ top: string; bottom: string }> {
    return await page.locator(".cm-scroller").evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        top: style.getPropertyValue("--cm-fade-top").trim(),
        bottom: style.getPropertyValue("--cm-fade-bottom").trim(),
      };
    });
  }

  test("only the edge that hides text is faded", async ({ page }) => {
    await openLongManuscript(page);

    // Nothing is above the first line, so the top edge has nothing to say.
    expect(await fade(page)).toEqual({ top: "0px", bottom: "20px" });

    await page.locator(".cm-scroller").evaluate((node) => {
      node.scrollTop = Math.round(node.scrollHeight / 2);
    });
    await expect
      .poll(async () => await fade(page))
      .toEqual({ top: "20px", bottom: "20px" });

    await page.locator(".cm-scroller").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    await expect
      .poll(async () => await fade(page))
      .toEqual({ top: "20px", bottom: "0px" });
  });

  test("the caret on the first line is drawn at its full colour", async ({ page }) => {
    await openLongManuscript(page);
    // The caret blinks, and a photograph of it is a coin toss unless the blink
    // is stopped first: what is being asked is the colour it is drawn in, not
    // which half of the blink the screenshot landed on.
    await page.addStyleTag({
      content: ".cm-cursorLayer { animation: none !important; opacity: 1 !important; }",
    });
    const caret = page.locator(".cm-cursor").first();
    await expect(caret).toBeVisible();

    /*
     * Read off the screen rather than off the stylesheet: the defect this
     * guards against was a caret whose colour was correct in every computed
     * style and pale in every pixel, because a mask above it took the colour
     * away after the fact.
     */
    const box = await settled(caret);
    /*
     * The window is taken in the units it was measured in. A phone's screen has
     * two and a half device pixels to one of these, so a picture taken in the
     * screen's own units would make a row of it a third of the row being
     * reasoned about - and the first of those thirds is as likely to be the gap
     * above the caret as the caret. It also starts on the first whole pixel
     * inside the caret rather than on the last one outside it.
     */
    const clip = {
      x: Math.floor(box.x) - 2,
      y: Math.ceil(box.y),
      width: 6,
      height: Math.floor(box.height),
    };
    const shot = (
      await page.screenshot({ animations: "disabled", clip, scale: "css" })
    ).toString("base64");
    const rows = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (context === null) return [];
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, image.width, image.height).data;
      const darkest: number[] = [];
      for (let y = 0; y < image.height; y += 1) {
        let value = 255;
        for (let x = 0; x < image.width; x += 1) {
          const at = (y * image.width + x) << 2;
          const red = pixels[at] ?? 255;
          const green = pixels[at + 1] ?? 255;
          const blue = pixels[at + 2] ?? 255;
          value = Math.min(value, (red + green + blue) / 3);
        }
        darkest.push(value);
      }
      return darkest;
    }, shot);

    // The row below the top of the caret against a row in its middle: a fade
    // 20px deep would leave the first several times lighter than the second.
    const near = rows[1] ?? 255;
    const middle = rows[Math.floor(rows.length / 2)] ?? 0;
    expect(near).toBeLessThan(middle + 12);
  });
});

test.describe("editing after the check has run", () => {
  test("the document says its findings now point at a text that moved", async ({
    page,
  }) => {
    /*
     * Correcting the text here is the point of the screen - the corrected file
     * is what Download gives back - and the places follow the correction. What
     * does not follow it is the check itself: the findings were written against
     * the text as it was sent, so the document says that it has moved on since,
     * because a verdict about characters that have been replaced looks exactly
     * like one about the characters that are there.
     */
    await page.goto("/");
    await dropManuscript(page);
    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("edited-after-run")).toHaveCount(0);

    await page.getByTestId("document-name-open").click();
    await page.getByTestId("editor").getByRole("textbox").click();
    await page.keyboard.type("% a line added afterwards");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("edited-after-run")).toContainText(
      "edited since the check ran",
    );
  });

  test("correcting the text starts no check of its own", async ({ page }) => {
    /*
     * The invariant the results screen is built around, checked from the other
     * end: an edit changes what will be downloaded and nothing else. A new
     * check is something a person asks for, from an empty buffer, and never
     * something that happens because they corrected a sentence.
     */
    const submissions: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/jobs$/.test(request.url())) {
        submissions.push(request.url());
      }
    });

    await page.goto("/");
    await dropManuscript(page);
    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
    expect(submissions).toHaveLength(1);

    await page.getByTestId("document-name-open").click();
    await page.getByTestId("editor").getByRole("textbox").click();
    await page.keyboard.type("% a paragraph corrected after the results arrived\n");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("edited-after-run")).toBeVisible();
    expect(submissions).toHaveLength(1);
  });

  test("a text typed and put back exactly as it was is not edited", async ({ page }) => {
    // The mark is taken from the hash of the text, not from whether the field
    // was touched: undo gives back the same bytes and therefore the same hash.
    await page.goto("/");
    await dropManuscript(page);
    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("document-name-open").click();
    await page.getByTestId("editor").getByRole("textbox").click();
    await page.keyboard.type("xyz");
    await expect(page.getByTestId("edited-after-run")).toContainText(
      "edited since the check ran",
    );
    for (let press = 0; press < 3; press += 1) await page.keyboard.press("Backspace");
    await page.keyboard.press("Escape");

    await expect(page.getByTestId("edited-after-run")).toHaveCount(0);
  });
});

test.describe("downloading", () => {
  test("the saved text is the sent text, character for character", async ({ page }) => {
    await page.goto("/");
    await dropManuscript(page);

    // Read off the request itself: the mock answers from a service worker, so
    // nothing reaches the network layer an interceptor would sit on.
    let sent = "";
    page.on("request", (request) => {
      if (!/\/jobs$/.test(request.url())) return;
      const body = request.postData() ?? "{}";
      const parsed = JSON.parse(body) as {
        documents: ReadonlyArray<{ name: string; text: string }>;
      };
      sent = parsed.documents.find((entry) => entry.name === "paper.tex")?.text ?? "";
    });

    await page.getByRole("button", { name: "paper.tex", exact: true }).click();
    await page.getByTestId("editor").getByRole("textbox").click();
    // A non-breaking space and a soft hyphen: the two characters a tidy-up on
    // the way out would silently remove, and the two several checks look for.
    await page.keyboard.type("% edited by­hand\n");
    await page.keyboard.press("Escape");

    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });
    expect(sent).toContain("% edited by­hand");

    await page.getByTestId("document-name-open").click();
    const [saved] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-document").click(),
    ]);
    expect(saved.suggestedFilename()).toBe("paper.tex");

    const stream = await saved.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toBe(sent);
  });

  test("each check hands its file back in its own format", async ({ page }) => {
    /*
     * The kind an artifact carries is the kind of file that module writes, and
     * it is what the file is saved under. BibCheck writes a bibliography and
     * PreSubmit writes a checklist; offering the checklist as a `.bib` is how a
     * person ends up with a folder of files none of which open in the thing
     * that made them.
     */
    await page.goto("/");
    // A manuscript that names a bibliography, so BibCheck is ticked alongside
    // PreSubmit and there are two checks writing two different files.
    await page.getByTestId("file-input").setInputFiles({
      name: "paper.tex",
      mimeType: "text/plain",
      buffer: Buffer.from(MANUSCRIPT.replace(END, BIB + END), "utf8"),
    });
    await expect(page.getByTestId("document-card")).toHaveCount(1);
    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

    /*
     * Waited for rather than counted once: a card appears as soon as its own
     * module has finished, so the checks that wrote a file arrive one after
     * another and a single read can land before the second of them.
     */
    const artifacts = page.getByTestId("open-artifact");
    await expect.poll(() => artifacts.count()).toBeGreaterThan(1);
    const count = await artifacts.count();

    const saved: string[] = [];
    for (let index = 0; index < count; index += 1) {
      await artifacts.nth(index).click();
      const overlay = page.getByRole("dialog");
      await expect(overlay).toBeVisible();
      const [file] = await Promise.all([
        page.waitForEvent("download"),
        page.getByTestId("download-document").click(),
      ]);
      saved.push(file.suggestedFilename());
      // Waited for rather than assumed: the next press lands on the button
      // behind the overlay if the overlay is still playing its exit.
      await page.keyboard.press("Escape");
      await expect(overlay).toBeHidden();
    }

    // More than one extension among them: one everywhere is the mark of a body
    // borrowed from another module rather than of a product that agrees.
    const extensions = new Set(saved.map((name) => name.split(".").pop()));
    expect(extensions.size).toBeGreaterThan(1);
    expect(saved).toContain("paper-bibcheck.bib");
    expect(saved).toContain("paper-presubmit.md");
  });

  test("every object address a download makes is released again", async ({ page }) => {
    /*
     * Released at once rather than on unload. A blob URL that is never revoked
     * pins the whole manuscript in memory for the life of the tab, and an
     * afternoon of downloads pins every version of it.
     */
    await page.addInitScript(() => {
      const made: string[] = [];
      const freed: string[] = [];
      Object.assign(window, { __urls: { made, freed } });
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (object: Blob | MediaSource) => {
        const url = create(object);
        made.push(url);
        return url;
      };
      URL.revokeObjectURL = (url: string) => {
        freed.push(url);
        revoke(url);
      };
    });

    await page.goto("/");
    await dropManuscript(page);
    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 15_000 });

    await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-report").first().click(),
    ]);

    const urls = await page.evaluate(
      () => (window as unknown as { __urls: { made: string[]; freed: string[] } }).__urls,
    );
    expect(urls.made.length).toBeGreaterThan(0);
    expect(urls.freed).toEqual(urls.made);
  });
});
