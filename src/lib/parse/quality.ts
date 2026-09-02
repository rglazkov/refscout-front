/**
 * The heuristics that decide whether what came out of a parser is a document or
 * damage. They are numbers rather than judgement, and the same numbers go to
 * telemetry - which is how we find out which PDFs we extract badly without
 * holding a single character of anybody's manuscript.
 */
import { countCodePoints } from "@/lib/docs/units";

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

const REPLACEMENT = "\u{fffd}";

/**
 * Printable, for this purpose, is everything that is not a control character.
 * Tab, newline and form feed are text: a PDF extracted page by page is full of
 * them, and counting them as damage would condemn every document we produce.
 */
export function printableRatio(text: string): number {
  const total = countCodePoints(text);
  if (total === 0) return 0;
  let unprintable = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    const isControl =
      (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0c) ||
      (code >= 0x7f && code <= 0x9f);
    if (isControl || character === REPLACEMENT) unprintable += 1;
  }
  return (total - unprintable) / total;
}

export function countReplacements(text: string): number {
  let count = 0;
  for (const character of text) if (character === REPLACEMENT) count += 1;
  return count;
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

export function assess(text: string): Quality {
  const chars = countCodePoints(text);
  const ratio = printableRatio(text);
  const replacements = countReplacements(text);
  const empty = text.trim() === "";
  return {
    chars,
    printableRatio: ratio,
    replacements,
    empty,
    suspicious:
      !empty &&
      (ratio < MIN_PRINTABLE_RATIO ||
        replacements / Math.max(chars, 1) > MAX_REPLACEMENT_RATIO),
  };
}
