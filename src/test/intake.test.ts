import { describe, expect, it } from "vitest";

import { decode, detectEol, fromBytes, fromString } from "@/features/intake/read-text";

/**
 * Reading the formats that are already text (M1.3.3). Three operations are
 * forced - the encoding, the byte-order mark, the line endings - and every
 * other tidying up is refused: the person gets the file back, and several
 * checks look for exactly the characters a normaliser would take out (§6).
 */
function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe("the encoding is determined rather than assumed", () => {
  it("a byte-order mark answers outright, and is not left in the text", () => {
    const utf8 = new TextEncoder().encode("\u{feff}hello");
    const read = fromBytes(utf8);
    expect(read.text).toBe("hello");
    expect(read.hadBom).toBe(true);
    expect(read.encoding).toBe("utf-8");
  });

  it("valid UTF-8 without a mark is read as UTF-8", () => {
    const read = fromBytes(new TextEncoder().encode("héllo — ok"));
    expect(read.text).toBe("héllo — ok");
    expect(read.encoding).toBe("utf-8");
  });

  it("a file that is not valid UTF-8 falls back rather than losing characters", () => {
    // Where a .bib exported by an older reference manager usually lands.
    const read = fromBytes(bytes(0x53, 0x6d, 0x69, 0x74, 0x68, 0xe9));
    expect(read.encoding).toBe("windows-1252");
    expect(read.text).toBe("Smithé");
  });

  it("the decoder reports the encoding it used", () => {
    expect(decode(new TextEncoder().encode("plain")).encoding).toBe("utf-8");
  });
});

describe("line endings are normalised and remembered", () => {
  it.each([
    ["\r\n", "windows"],
    ["\r", "an old conversion"],
    ["\n", "unix"],
  ])("%s is recognised (%s)", (eol) => {
    const read = fromBytes(new TextEncoder().encode(`one${eol}two`));
    expect(read.eol).toBe(eol);
    // Inside the product there is one line ending; the file is rebuilt with the
    // one it arrived with when it is downloaded again (§18).
    expect(read.text).toBe("one\ntwo");
  });

  it("a lone CR is a third case and not a mangled CRLF", () => {
    expect(detectEol("a\rb")).toBe("\r");
    expect(detectEol("a\r\nb")).toBe("\r\n");
  });
});

describe("nothing else is done to the text (§6)", () => {
  it("non-breaking spaces, soft hyphens and control sequences are kept", () => {
    // Several checks look for exactly these, and the person gets the file back.
    const original = "a b­c​d\te";
    expect(fromString(original).text).toBe(original);
  });

  it("the text is not put through Unicode normalisation", () => {
    // The composed and the decomposed forms look identical and are different
    // strings; normalising here would move every offset in an answer.
    const decomposed = "éclair";
    expect(fromString(decomposed).text).toBe(decomposed);
    expect(fromString(decomposed).text).not.toBe(decomposed.normalize("NFC"));
  });

  it("an astral character survives the round trip intact", () => {
    const withAstral = "score 𝄞 here";
    expect(fromBytes(new TextEncoder().encode(withAstral)).text).toBe(withAstral);
  });
});
