/**
 * Reading the formats that are already text (M1.3.3). Determining the encoding,
 * cutting the byte-order mark and normalising the line endings - the same three
 * operations for all five extensions, in the main thread, because reading a
 * text file takes milliseconds and blocks nothing. The workers arrive in M2
 * with pdf.js and mammoth, which genuinely need them.
 *
 * Nothing else is done to the text. The three operations above are forced -
 * without them the offsets in an answer would be counted over a different
 * string than the one on screen - and every other tidying up, NFC included, is
 * refused here: the person gets the file back, and several checks look for
 * exactly the characters a normaliser would remove (§6).
 */
export type ExtractedText = {
  readonly text: string;
  readonly hadBom: boolean;
  readonly eol: "\n" | "\r\n" | "\r";
  readonly encoding: string;
};

const BOM = "\u{feff}";

/**
 * Which line ending the file used. Three values, because a lone CR still turns
 * up in old conversions, and the file is rebuilt with the ending it arrived
 * with when it is downloaded again (§18).
 */
export function detectEol(raw: string): "\n" | "\r\n" | "\r" {
  if (raw.includes("\r\n")) return "\r\n";
  if (raw.includes("\r")) return "\r";
  return "\n";
}

export function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

/**
 * The encoding. A byte-order mark answers the question outright; without one,
 * UTF-8 is tried strictly, and only a file that is not valid UTF-8 falls back
 * to windows-1252 - which is where a .bib exported by an old reference manager
 * usually lands.
 */
export function decode(bytes: Uint8Array): {
  text: string;
  encoding: string;
  hadBom: boolean;
} {
  const [b0, b1, b2] = [bytes[0], bytes[1], bytes[2]];
  // Whether the file carried a mark is read from the bytes, not from the text:
  // TextDecoder removes the mark as it decodes, so by the time there is a
  // string the evidence is gone - and the mark has to be put back when the file
  // is handed to the person again (§18).
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
    return {
      text: new TextDecoder("utf-8").decode(bytes),
      encoding: "utf-8",
      hadBom: true,
    };
  }
  if (b0 === 0xff && b1 === 0xfe) {
    return {
      text: new TextDecoder("utf-16le").decode(bytes),
      encoding: "utf-16le",
      hadBom: true,
    };
  }
  if (b0 === 0xfe && b1 === 0xff) {
    return {
      text: new TextDecoder("utf-16be").decode(bytes),
      encoding: "utf-16be",
      hadBom: true,
    };
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      encoding: "utf-8",
      hadBom: false,
    };
  } catch {
    return {
      text: new TextDecoder("windows-1252").decode(bytes),
      encoding: "windows-1252",
      hadBom: false,
    };
  }
}

export function fromBytes(bytes: Uint8Array): ExtractedText {
  const { text: decoded, encoding, hadBom } = decode(bytes);
  const withoutBom = decoded.startsWith(BOM) ? decoded.slice(BOM.length) : decoded;
  return {
    text: normalizeLineEndings(withoutBom),
    hadBom,
    eol: detectEol(withoutBom),
    encoding,
  };
}

export async function readTextFile(file: File): Promise<ExtractedText> {
  return fromBytes(new Uint8Array(await file.arrayBuffer()));
}

/** Typed and pasted text arrives already decoded; it still gets the same treatment. */
export function fromString(raw: string): ExtractedText {
  const hadBom = raw.startsWith(BOM);
  const withoutBom = hadBom ? raw.slice(BOM.length) : raw;
  return {
    text: normalizeLineEndings(withoutBom),
    hadBom: false,
    eol: detectEol(withoutBom),
    encoding: "utf-8",
  };
}
