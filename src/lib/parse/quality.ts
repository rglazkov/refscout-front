/**
 * The heuristics that decide whether what came out of a parser is a document or
 * damage, and the counters that describe it. They are numbers rather than
 * judgement, and the same numbers go to telemetry - which is how we find out
 * which PDFs we extract badly without holding a single character of anybody's
 * manuscript.
 *
 * Everything here is measured in one pass. A dissertation is three million code
 * points, and each separate walk over it is tens of milliseconds of a thread
 * that is not doing anything else: counting the characters, the words, the
 * control characters and the replacements one at a time cost four such walks
 * for numbers that all fall out of the same loop.
 */

/**
 * Below this share of printable characters the text is rubbish rather than
 * prose. Real manuscripts sit above 0.999: the margin here is wide because the
 * cost of a false accusation is a person being told to check a file that was
 * fine, and the cost of a miss is caught by the replacement-character rule
 * below anyway.
 */
const MIN_PRINTABLE_RATIO = 0.9;

/**
 * A handful of replacement characters is a broken glyph in a formula. A steady
 * sprinkling of them is a decoding that went wrong, and the person needs to
 * hear about it before the text is checked.
 */
const MAX_REPLACEMENT_RATIO = 0.002;

const REPLACEMENT = 0xfffd;

/**
 * Printable, for this purpose, is everything that is not a control character.
 * Tab, newline and form feed are text: a PDF extracted page by page is full of
 * them, and counting them as damage would condemn every document we produce.
 */
function isUnprintable(point: number): boolean {
  if (point === REPLACEMENT) return true;
  if (point < 0x20) return point !== 0x09 && point !== 0x0a && point !== 0x0c;
  return point >= 0x7f && point <= 0x9f;
}

/**
 * Whitespace as a word count has always meant it here: the same set `\s`
 * matches in a Unicode-aware regular expression. It is written out rather than
 * tested with one, because the test happens once per code point of a
 * three-million-character document and a regular expression cannot be asked
 * about a single one without building a string to hold it.
 */
function isSpace(point: number): boolean {
  if (point === 0x20) return true;
  if (point >= 0x09 && point <= 0x0d) return true;
  if (point < 0x80) return false;
  return (
    point === 0xa0 ||
    point === 0x1680 ||
    (point >= 0x2000 && point <= 0x200a) ||
    point === 0x2028 ||
    point === 0x2029 ||
    point === 0x202f ||
    point === 0x205f ||
    point === 0x3000 ||
    point === 0xfeff
  );
}

export type Quality = {
  readonly chars: number;
  readonly printableRatio: number;
  readonly replacements: number;
  /** Nothing came out at all - the same outcome as a scan. */
  readonly empty: boolean;
  /** Something came out, and it does not read as text. */
  readonly suspicious: boolean;
};

/**
 * The verdict together with the counters a card prints. A word is a run of
 * anything that is not whitespace: counting by dictionary would be a
 * per-language decision, and the number's job here is to give a sense of scale.
 */
export type TextStats = Quality & { readonly words: number };

/**
 * The same, plus the hash of the text. It is taken beside the counters because
 * that is one more pass over the same three million characters, and the caller
 * needs both at the same moment: the hash answers whether the document has been
 * edited since it was read and whether it has been edited since the job
 * carrying it left.
 */
export type Measured = TextStats & { readonly sha256: string };

/** Cheap enough to ask on its own: a parser only needs to know there is nothing. */
export function isBlank(text: string): boolean {
  return text.trim() === "";
}

/**
 * Every number about a text, in one walk over it. Code points rather than
 * UTF-16 units, because that is the unit every measurement in the product is
 * in: `String.length` is a different number on exactly the formulas, emoji and
 * CJK a manuscript is made of, and the server counts code points too.
 */
export function measure(text: string): TextStats {
  let chars = 0;
  let unprintable = 0;
  let replacements = 0;
  let words = 0;
  let inWord = false;

  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    let point = unit;
    // A high surrogate followed by a low one is one code point, not two.
    if (unit >= 0xd800 && unit <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        point = (unit - 0xd800) * 0x400 + (next - 0xdc00) + 0x10000;
        index += 1;
      }
    }

    chars += 1;
    if (point === REPLACEMENT) replacements += 1;
    if (isUnprintable(point)) unprintable += 1;

    if (isSpace(point)) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      words += 1;
    }
  }

  const printableRatio = chars === 0 ? 0 : (chars - unprintable) / chars;
  // A text of nothing but whitespace has no words, and that is also what makes
  // it empty: the two answers come from the same walk rather than from a
  // separate `trim`, which would copy the whole document to ask.
  const empty = words === 0;

  return {
    chars,
    printableRatio,
    replacements,
    words,
    empty,
    suspicious:
      !empty &&
      (printableRatio < MIN_PRINTABLE_RATIO ||
        replacements / Math.max(chars, 1) > MAX_REPLACEMENT_RATIO),
  };
}

/** The verdict alone, for a caller that has no use for the word count. */
export function assess(text: string): Quality {
  const { chars, printableRatio, replacements, empty, suspicious } = measure(text);
  return { chars, printableRatio, replacements, empty, suspicious };
}
