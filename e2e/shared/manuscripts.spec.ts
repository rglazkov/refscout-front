import { expect, test, type Page } from "@playwright/test";

import {
  bullet,
  buildDocx,
  buildPdf,
  cjkFontObjects,
  cp1251Bytes,
  paragraph,
  scanPage,
  scanResources,
  textPage,
  unicodeFontObjects,
  withFootnote,
} from "../../src/test/corpus";

/**
 * Manuscripts, in a real browser. This is where the parsing runs the way it
 * runs for a person: in a worker, in a tab, with the character maps fetched
 * from the address the build copied them to. The fast lane can check the
 * parsers, but it cannot check the wiring around them - a worker that will not
 * start and a resource folder that was not copied both look fine from Node.
 *
 * The fixtures are the corpus generators, so nothing here is a file in the
 * repository either.
 */
async function drop(
  page: Page,
  name: string,
  bytes: Uint8Array,
  mimeType = "application/pdf",
): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name,
    mimeType,
    buffer: Buffer.from(bytes),
  });
}

const card = (page: Page) => page.getByTestId("document-card").first();

test.describe("PDF and Word arrive like any other document", () => {
  test("a PDF is read in the browser and proposes its checks", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));

    await page.goto("/");
    await drop(
      page,
      "paper.pdf",
      buildPdf([
        textPage(["Introduction", "We estimate the variance of the estimator."]),
        textPage(["Method", "The sample was dried at forty degrees."]),
      ]),
    );

    await expect(card(page)).toContainText("words", { timeout: 30_000 });
    // A manuscript arrives with the two checks a manuscript gets.
    await expect(page.getByTestId("check-presubmit")).toHaveAttribute(
      "data-state",
      "checked",
    );

    // The file itself never went anywhere: what the browser read is all that
    // could ever leave, and nothing has left yet.
    expect(requests.filter((url) => url.includes("/jobs"))).toEqual([]);

    await page.getByRole("button", { name: "paper.pdf", exact: true }).click();
    await expect(page.getByTestId("editor")).toContainText("estimate the variance");
  });

  test("a document in Chinese needs the character maps, and gets them", async ({
    page,
  }) => {
    // The other half of the character-map check. Without `cmaps/` beside the
    // build this document extracts as an empty string, which the quality
    // heuristics then report as a scan - a perfectly good file, refused. It is
    // checked here because only a browser fetches them.
    const font = cjkFontObjects("你好世界");
    await page.goto("/");
    await drop(
      page,
      "chinese.pdf",
      buildPdf([font.page], { extra: [...font.objects], resources: font.resources }),
    );

    await expect(card(page)).toContainText("words", { timeout: 30_000 });
    await page.getByRole("button", { name: "chinese.pdf", exact: true }).click();
    await expect(page.getByTestId("editor")).toContainText("你好世界");
  });

  test("a Word file becomes markdown and comes back a Word file", async ({ page }) => {
    await page.goto("/");
    await drop(
      page,
      "thesis.docx",
      buildDocx(
        [
          paragraph("On the estimation of variance", "Heading1"),
          bullet("Rinse the sample twice"),
          withFootnote("The estimator is unbiased"),
        ].join(""),
      ),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    await expect(card(page)).toContainText("words", { timeout: 30_000 });
    await page.getByRole("button", { name: "thesis.docx", exact: true }).click();
    const editor = page.getByTestId("editor");
    await expect(editor).toContainText("# On the estimation of variance");
    await expect(editor).toContainText("The footnote that proves footnotes survive.");

    // You get back the format you brought, and the file is assembled here from
    // the markdown the person has been reading.
    await expect(page.getByTestId("download-document")).toContainText(".docx");
    // Said where the person presses rather than in a help page: somebody who
    // brought a typeset manuscript would otherwise learn that its layout is
    // gone by opening what they had just saved.
    await expect(page.getByRole("dialog")).toContainText(
      "the original layout and pictures are not",
    );

    const [saved] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("download-document").click(),
    ]);
    expect(saved.suggestedFilename()).toBe("thesis.docx");

    const stream = await saved.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    // A `.docx` is a zip of XML parts, so the container's own signature is what
    // says a Word file was built rather than markdown given a new extension.
    expect(Buffer.concat(chunks).subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

test.describe("a document that will not read", () => {
  test("a scan is named as one, and keeps its card and a way out", async ({ page }) => {
    const image =
      "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 " +
      "/ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n \nendstream";
    await page.goto("/");
    await drop(
      page,
      "scan_2019.pdf",
      buildPdf([scanPage()], { extra: [image], resources: scanResources }),
    );

    const notice = page.getByTestId("extract-notice");
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toHaveAttribute("data-extract-code", "NO_TEXT_LAYER");
    await expect(notice).toContainText("No text found");
    // The document stays in the buffer with the reason on it, which is what
    // makes it obvious which of five documents is the problem.
    await expect(page.getByTestId("document-card")).toHaveCount(1);
    await expect(notice.getByTestId("type-text-in")).toBeVisible();
  });

  test("a protected PDF is unlocked on its own card", async ({ page }) => {
    await page.goto("/");
    await drop(
      page,
      "draft.pdf",
      buildPdf([textPage(["A protected draft of the thesis."])], {
        password: "opensesame",
      }),
    );

    const notice = page.getByTestId("extract-notice");
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toHaveAttribute("data-extract-code", "PDF_PASSWORD_REQUIRED");

    await notice.getByTestId("pdf-password").fill("wrong");
    await notice.getByTestId("unlock-pdf").click();
    await expect(notice).toHaveAttribute("data-extract-code", "PDF_PASSWORD_WRONG");

    await notice.getByTestId("pdf-password").fill("opensesame");
    await notice.getByTestId("unlock-pdf").click();
    await expect(page.getByTestId("extract-notice")).toHaveCount(0, { timeout: 30_000 });
    await expect(card(page)).toContainText("words");
  });

  test("one broken document does not stop the others", async ({ page }) => {
    const image =
      "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 " +
      "/ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n \nendstream";
    await page.goto("/");
    await drop(
      page,
      "scan.pdf",
      buildPdf([scanPage()], { extra: [image], resources: scanResources }),
    );
    await expect(page.getByTestId("extract-notice")).toBeVisible({ timeout: 30_000 });

    await drop(
      page,
      "paper.tex",
      new TextEncoder().encode(
        "\\documentclass{article}\n\\begin{document}\nA readable manuscript.\n\\end{document}\n",
      ),
      "text/plain",
    );

    await expect(page.getByTestId("document-card")).toHaveCount(2);
    // The plan is recalculated without the broken one and says both numbers.
    await expect(page.getByTestId("buffer-counts")).toContainText("In the buffer: 2");
    await expect(page.getByTestId("sending-counts")).toContainText("Will be sent: 1");
    await expect(page.getByTestId("run")).toBeEnabled();
  });
});

test.describe("the whole point of editing before the run", () => {
  test("a badly read PDF is corrected by hand and leaves corrected", async ({ page }) => {
    /*
     * The scenario extraction exists to make possible. It is now the only path
     * a document has, so a PDF we read badly is a product that does not work
     * for that person - unless they can see what we read and fix it here, which
     * is why the editor was built before the rest of it.
     */
    const font = unicodeFontObjects(["\ufffd"]);
    const rubbish = buildPdf([font.page(Array.from({ length: 200 }, () => 0))], {
      extra: [...font.objects],
      resources: font.resources,
    });

    const bodies: string[] = [];
    page.on("request", (request) => {
      if (/\/jobs$/.test(request.url()) && request.method() === "POST") {
        bodies.push(request.postData() ?? "");
      }
    });

    await page.goto("/");
    await drop(page, "scanned_thesis.pdf", rubbish);

    const notice = page.getByTestId("extract-notice");
    await expect(notice).toBeVisible({ timeout: 30_000 });
    await expect(notice).toHaveAttribute("data-extract-state", "suspicious");

    // The way out is the editor, and it is offered as one: there is text here,
    // and the person is being asked to look at it rather than to retype it.
    await notice.getByTestId("type-text-in").click();
    const editor = page.getByTestId("editor");
    await expect(editor).toBeVisible();
    await editor.getByRole("textbox").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("A manuscript typed in by hand, in place of the rubbish.");
    await page.keyboard.press("Escape");

    // Corrected, it is an ordinary document again.
    await expect(page.getByTestId("extract-notice")).toHaveCount(0);
    await page.getByTestId("check-presubmit").click();
    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 30_000 });

    // And what left is what the person corrected, not what the parser read.
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toContain("typed in by hand");
    expect(bodies[0]).not.toContain("\ufffd\ufffd\ufffd");
  });
});

test.describe("one encoding for the whole product", () => {
  test("a .txt that is not UTF-8 is read, and nothing asks about encodings", async ({
    page,
  }) => {
    /*
     * `.txt` is treated like every other format: the bytes are decoded, the
     * document is a UTF-8 string from then on, and the file handed back is
     * UTF-8 too. There is no encoding to choose, because asking about one means
     * asking about something a person does not know about their own file - a
     * text that came out wrong shows it, and the editor is the answer.
     */
    await page.goto("/");
    await drop(page, "requirements.txt", cp1251Bytes(), "text/plain");
    await expect(card(page)).toContainText("characters", { timeout: 30_000 });

    expect(await page.getByTestId("choose-encoding").count()).toBe(0);
    await expect(page.getByText(/encoding/i)).toHaveCount(0);
  });

  test("the drop zone names every format it reads", async ({ page }) => {
    await page.goto("/");
    const zone = page.getByTestId("drop-zone");
    for (const format of ["PDF", "DOCX", "TEX", "BIB", "GLS", "MD", "TXT"]) {
      await expect(zone).toContainText(format);
    }
    await expect(page.getByTestId("file-input")).toHaveAttribute(
      "accept",
      /\.pdf.*\.docx/,
    );
  });
});
