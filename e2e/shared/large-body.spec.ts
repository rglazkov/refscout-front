import { expect, test } from "@playwright/test";

/**
 * A submission big enough to be compressed, put through end to end.
 *
 * `fetch` does not compress what it sends, so the client does it explicitly
 * above roughly sixty-four kilobytes - and that is the size a real manuscript
 * arrives at, not an edge case. It belongs here rather than in the fast lane
 * because only a browser produces a compressed body, and because the mock has
 * to inflate one: a second source that answers every request except the one the
 * product actually makes is not a second source.
 */
const SENTENCE = "Dense retrieval is usually left to a frozen encoder. ";

const BODY = [
  "\\documentclass{article}",
  "\\begin{document}",
  SENTENCE.repeat(3_000),
  "\\bibliography{refs}",
  "\\end{document}",
  "",
].join("\n");

test("a body large enough to compress leaves compressed, and is understood", async ({
  page,
}) => {
  const sent: { encoding: string | undefined; bytes: number }[] = [];
  page.on("request", (request) => {
    if (!/\/jobs$/.test(request.url()) || request.method() !== "POST") return;
    const headers = request.headers();
    sent.push({
      encoding: headers["content-encoding"],
      bytes: Number(headers["content-length"] ?? 0),
    });
  });

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "long.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(BODY, "utf8"),
  });
  await expect(page.getByTestId("document-card")).toContainText("characters", {
    timeout: 60_000,
  });

  await page.getByTestId("run").click();
  // The point of it: the mock inflated the body and answered, instead of
  // trying to read a gzip stream as JSON and failing where nobody was looking.
  await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 60_000 });

  expect(sent).toHaveLength(1);
  expect(sent[0]?.encoding).toBe("gzip");
  // And it really is smaller than the text it carries. Four- to fivefold on
  // prose is the difference between a long upload and a short one, and on the
  // largest submissions between one that arrives and one a proxy refuses.
  expect(sent[0]?.bytes ?? Number.POSITIVE_INFINITY).toBeLessThan(BODY.length / 3);
});
