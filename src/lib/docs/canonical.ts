import { type SourceFormat } from "@/lib/domain";

/**
 * The one step between a parser and the document. Every text in the product
 * passes through here exactly once, at extraction, and nothing downstream
 * touches it again: the page map, the entry boundaries, the character count and
 * every offset in an answer are all counted after this, so a second
 * normalisation later would move them silently.
 *
 * The step has two halves with different standing. Four operations are forced -
 * without them the system does not work - and the fifth, Unicode normalisation,
 * is a choice made per class of format.
 *
 * What is deliberately absent is any tidying up: no NFKC, no trimming, no
 * straightening of quotation marks, no unhyphenation. A ligature tells a text
 * from a PDF apart from a typed one, a narrow space in 1 000 000 was put there
 * by the author, and a brace in a `.tex` is syntax. The checks look for exactly
 * those characters, so a tidy-up does not protect the modules - it takes their
 * input away.
 */
export type Eol = "\n" | "\r\n" | "\r";

export type ExtractedText = {
  readonly text: string;
  readonly hadBom: boolean;
  readonly eol: Eol;
  /**
   * How many code points were damaged beyond repair and replaced. It is a
   * number rather than a flag because it goes to telemetry, where it says how
   * often we produce broken text without carrying any of it.
   */
  readonly repaired: number;
};

const BOM = "\u{feff}";

/** U+FFFD. Both forced replacements below put this in place of what cannot travel. */
const REPLACEMENT = "\u{fffd}";

/**
 * Which line ending the file used. Three values, because a lone CR still turns
 * up in old conversions, and the file is rebuilt with the ending it arrived
 * with when it is downloaded again.
 */
export function detectEol(raw: string): Eol {
  if (raw.includes("\r\n")) return "\r\n";
  if (raw.includes("\r")) return "\r";
  return "\n";
}

export function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

/**
 * The two replacements that are about the string being transmissible at all.
 *
 * A lone surrogate is a valid JavaScript string and is not encodable as UTF-8,
 * so the number of characters in it is undefined and the request body cannot be
 * built. A NUL is refused by PostgreSQL in a text column. Neither is text: both
 * are damage, both are visible to the person in the editor, and neither is
 * restored on the way back out.
 */
export function repairCodePoints(raw: string): { text: string; repaired: number } {
  let repaired = 0;
  /*
   * The `u` flag is what keeps this to the damage. Under it the pattern matches
   * code points rather than UTF-16 units, so a high surrogate that has its low
   * one is a single character above the basic plane - an emoji, a mathematical
   * italic - and never enters the class. What the class still holds is a
   * surrogate standing on its own, which is nobody's character, and NUL.
   */
  const text = raw.replace(/[\u0000\ud800-\udfff]/gu, () => {
    repaired += 1;
    return REPLACEMENT;
  });
  return { text, repaired };
}

/**
 * Whether the text of this format is ours or the author's. For `.pdf` and
 * `.docx` the text is the product of our extraction - there is no original to
 * be faithful to - so it is folded into NFC. For everything else the file is
 * the text, the person gets it back, and any normalisation of ours would be an
 * edit to their file.
 */
export function isDerivedFormat(format: SourceFormat): boolean {
  return format === "pdf" || format === "docx";
}

/**
 * Bytes into a string. A byte-order mark says what the file is outright;
 * without one UTF-8 is tried strictly, and only a file that is not valid UTF-8
 * falls back to windows-1252 - which is where a `.bib` exported by an old
 * reference manager usually lands.
 *
 * The encoding it took is not kept, and nothing downstream varies by it. Every
 * document in the product is a UTF-8 string from here on, whatever format it
 * came from and whatever bytes it was written in, and the file handed back is
 * UTF-8 too. A text that will not decode cleanly shows the replacement
 * characters it produced, and the way out of that is the editor or saving the
 * file again as UTF-8.
 */
export function decode(bytes: Uint8Array): { text: string; hadBom: boolean } {
  const [b0, b1, b2] = [bytes[0], bytes[1], bytes[2]];
  // Whether the file carried a mark is read from the bytes, not from the text:
  // TextDecoder removes the mark as it decodes, so by the time there is a
  // string the evidence is gone - and the mark has to be put back when the file
  // is handed to the person again.
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes), hadBom: true };
  }
  if (b0 === 0xff && b1 === 0xfe) {
    return { text: new TextDecoder("utf-16le").decode(bytes), hadBom: true };
  }
  if (b0 === 0xfe && b1 === 0xff) {
    return { text: new TextDecoder("utf-16be").decode(bytes), hadBom: true };
  }
  try {
    return {
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      hadBom: false,
    };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(bytes), hadBom: false };
  }
}

/**
 * The whole step, over a string that has already been decoded. Parsers of
 * binary formats end here too: pdf.js and mammoth hand back a string, and it
 * becomes a document through exactly this function.
 */
export function canonicalise(
  raw: string,
  options: { readonly format: SourceFormat },
): ExtractedText {
  const hadBom = raw.startsWith(BOM);
  const withoutBom = hadBom ? raw.slice(BOM.length) : raw;
  const eol = detectEol(withoutBom);
  const { text: repairedText, repaired } = repairCodePoints(
    normalizeLineEndings(withoutBom),
  );
  return {
    text: isDerivedFormat(options.format) ? repairedText.normalize("NFC") : repairedText,
    hadBom,
    eol,
    repaired,
  };
}

export function fromBytes(bytes: Uint8Array, format: SourceFormat): ExtractedText {
  const { text, hadBom } = decode(bytes);
  return { ...canonicalise(text, { format }), hadBom };
}

/**
 * Typed and pasted text arrives already decoded, and it gets the same treatment.
 * `hadBom` is false whatever the paste began with: nothing was brought in from
 * a file, so there is no file shape to restore on the way out.
 */
export function fromString(raw: string, format: SourceFormat = "typed"): ExtractedText {
  return { ...canonicalise(raw, { format }), hadBom: false };
}
