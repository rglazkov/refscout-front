import { afterEach, describe, expect, it, vi } from "vitest";

import { acceptFile } from "@/features/intake/intake";
import { releaseAllSourceFiles, sourceFileOf } from "@/lib/docs";
import { ParseFailure } from "@/lib/parse/failure";

/**
 * How long the file behind a document is held.
 *
 * The rule is short and the reason it is not shorter matters: the file is
 * needed while the text is being taken out of it, and after that only where a
 * way out on the card would open it a second time. A document that read
 * cleanly has no such way out, so its handle goes as soon as the text exists -
 * from that point the product works on the text, and the file handed back at
 * the end is written from the text rather than from the one that was brought.
 *
 * It is asked here rather than through the screen because it is invisible by
 * design: a released handle looks exactly like a held one until something tries
 * to read it.
 */
const extract = vi.hoisted(() => vi.fn());
// Only the parse is replaced. Everything else the module offers is the real
// thing, including the assessment that decides whether a document read cleanly
// - which is the very fact this test turns on.
vi.mock("@/workers", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  extract,
}));

afterEach(() => {
  releaseAllSourceFiles();
  extract.mockReset();
});

function bring(name: string, body: string): File {
  return new File([body], name, { type: "text/plain" });
}

const PROSE =
  "Dense retrieval is usually left to a frozen encoder, and the results are " +
  "reported over a corpus that nobody has read in full. This paragraph is " +
  "here to be ordinary text of a length that reads as a document.";

describe("the file behind a document is let go when the text is out", () => {
  it("a document that read cleanly keeps no handle to its file", async () => {
    extract.mockResolvedValue({
      extracted: { text: PROSE, hadBom: false, eol: "\n" },
    });

    const result = await acceptFile(
      bring("notes.txt", PROSE),
      { bufferChars: 0 },
      {},
      "a",
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.item.extract.state).toBe("ready");
    expect(sourceFileOf("a")).toBeUndefined();
  });

  it("a parse that failed keeps it, because the way out reads the file again", async () => {
    extract.mockRejectedValue(new ParseFailure("PDF_PASSWORD_REQUIRED"));

    const result = await acceptFile(
      bring("thesis.pdf", "%PDF"),
      { bufferChars: 0 },
      {},
      "b",
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.item.extract.state).toBe("needs-password");
    // "Try again" and the password field have something to read.
    expect(sourceFileOf("b")).toBeDefined();
  });

  it("a document read badly keeps it too: it is read again, not typed again", async () => {
    extract.mockResolvedValue({
      extracted: {
        text: "\u{fffd}\u{fffd}\u{fffd}\u{fffd}\u{fffd}",
        hadBom: false,
        eol: "\n",
      },
    });

    const result = await acceptFile(
      bring("scan.pdf", "%PDF"),
      { bufferChars: 0 },
      {},
      "c",
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.item.extract.state).not.toBe("ready");
    expect(sourceFileOf("c")).toBeDefined();
  });
});
