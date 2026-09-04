import { describe, expect, it } from "vitest";

import { downloadExtensionOf, downloadName } from "@/lib/docs";
import { fromBytes } from "@/lib/docs/canonical";
import { mediaTypeFor, withFileForm } from "@/lib/export";
import { sourceFormats } from "@/lib/domain";

import { AWKWARD_BIB, NESTED_MARKDOWN, TEX_WITH_INPUT } from "./corpus";

/**
 * You get back the format you brought. It is one rule, it lives in one place,
 * and both the main check and a comparison read it from there - which is why
 * this suite asks the rule directly rather than through either screen.
 */
describe("the format a document comes back in", () => {
  it.each([
    ["docx", "docx"],
    ["md", "md"],
    ["tex", "tex"],
    ["bib", "bib"],
    ["gls", "gls"],
    ["txt", "txt"],
  ] as const)("a %s is handed back as .%s", (format, extension) => {
    expect(downloadExtensionOf(format)).toBe(extension);
  });

  it("a PDF comes back as text, and permanently", () => {
    // We do not build PDFs: that is a document generator in the bundle and a
    // return to the binary formats this product moved away from.
    expect(downloadExtensionOf("pdf")).toBe("txt");
  });

  it("text that was typed comes back as text", () => {
    // It never had a format of its own, so there is none to give back.
    expect(downloadExtensionOf("typed")).toBe("txt");
  });

  it("every format the product accepts has an answer", () => {
    // Written as a sweep over the list rather than as six cases, so that a
    // format added to the product without a download rule fails here.
    for (const format of sourceFormats) {
      expect(downloadExtensionOf(format)).toMatch(/^[a-z]+$/);
    }
  });
});

describe("the type the file is handed over as", () => {
  it("a Word file is a Word file and not a piece of text", () => {
    // One `text/plain` for everything would offer a `.docx` to a text editor.
    expect(mediaTypeFor("docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("a Word file carries no character set, and the text formats do", () => {
    // A `.docx` is a zip container: calling it a zip of UTF-8 characters is
    // untrue of every byte in it.
    expect(mediaTypeFor("docx")).not.toContain("charset");
    for (const extension of ["bib", "tex", "gls", "md", "txt"]) {
      expect(mediaTypeFor(extension)).toContain("charset=utf-8");
    }
  });
});

describe("the file that comes back", () => {
  const encoder = new TextEncoder();

  /**
   * The promise is not carried by the extension alone. A document nobody edited
   * has to come back as the bytes it arrived as, and the two things stripped on
   * the way in for the editor's sake - the byte-order mark and the line
   * ending - are put back on the way out.
   *
   * Compared as bytes rather than as characters, because a comparison of
   * characters passes just as happily over a file whose shape has been lost.
   */
  it.each([
    ["markdown", NESTED_MARKDOWN, "md"] as const,
    ["LaTeX", TEX_WITH_INPUT, "tex"] as const,
    ["BibTeX", AWKWARD_BIB, "bib"] as const,
  ])("%s returns byte for byte", (_name, source, format) => {
    const original = encoder.encode(source);
    const read = fromBytes(original, format);
    const written = encoder.encode(withFileForm(read.text, read));
    expect([...written]).toEqual([...original]);
  });

  it("a file with a mark and Windows endings returns with both", () => {
    const original = encoder.encode("\u{feff}one\r\ntwo\r\n");
    const read = fromBytes(original, "txt");
    expect(read.hadBom).toBe(true);
    expect(read.eol).toBe("\r\n");
    expect([...encoder.encode(withFileForm(read.text, read))]).toEqual([...original]);
  });

  it("a file whose endings were mixed comes back with one kind", () => {
    // Named because it is a difference the person will see. The editor does not
    // remember which line was which, and there is no honest way to restore a
    // mixture - so the file is written throughout with the ending it was read
    // as having used.
    const read = fromBytes(encoder.encode("one\r\ntwo\nthree\r\n"), "txt");
    expect(withFileForm(read.text, read)).toBe("one\r\ntwo\r\nthree\r\n");
  });

  it("a text with no file behind it is written as it stands", () => {
    expect(withFileForm("typed here\n", undefined)).toBe("typed here\n");
  });
});

describe("the name the file is offered under", () => {
  it("is built from the document's own name", () => {
    // So that the corrected file lands beside the original instead of becoming
    // `download (3).bib`.
    expect(downloadName("refs.bib", "", "bib")).toBe("refs.bib");
    expect(downloadName("thesis.docx", "", "docx")).toBe("thesis.docx");
  });
});
