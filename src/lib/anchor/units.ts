import { type CpOffset, type DocOffset } from "@/lib/domain";

/**
 * The one place in the product where a code-point offset becomes a position in
 * a string, and the only one. Below this module code points do not exist: what
 * the editor, the page map and every search here work in is UTF-16 units,
 * because that is what a JavaScript string is made of.
 *
 * There are two paths through it, and which one is taken is decided by the
 * document rather than by the caller.
 *
 * The fast one: a text with no surrogate pairs in it counts the same in both
 * units, so the conversion is the identity. Testing for one is a single pass
 * and covers the overwhelming majority of manuscripts.
 *
 * The slow one: one pass collects the code-point positions of the characters
 * that take two units - emoji, the mathematical alphabets, the rarer CJK - into
 * an ascending array of numbers. It is taken while the text is being sent, at
 * the same time as the hash and the length, and the array is what is kept: by
 * the time an answer arrives the text that was sent may have been corrected
 * twice, and this is all that is needed of it. Converting forward is then the
 * offset plus the number of entries strictly below it, and converting back is a
 * search in the same array, because the UTF-16 start of the i-th such character
 * is `positions[i] + i`. One binary search per place, and no second index.
 *
 * `Array.from(text)` and `[...text]` are not used here and are not used
 * anywhere: on a manuscript of a megabyte either of them is a million strings
 * on the heap, and the slow path exists precisely for the documents where that
 * would happen - a text of mathematics is astral from end to end.
 */

/**
 * The positions, in code points, of every character that occupies two UTF-16
 * units, ascending. `null` is a text that has none, where both units agree and
 * there is nothing to convert.
 */
export type AstralIndex = Uint32Array | null;

/** True while the character at `at` opens a surrogate pair. */
function opensPair(text: string, at: number): boolean {
  const code = text.charCodeAt(at);
  if (code < 0xd800 || code > 0xdbff || at + 1 >= text.length) return false;
  const next = text.charCodeAt(at + 1);
  return next >= 0xdc00 && next <= 0xdfff;
}

/**
 * The index for one text, or `null` when the two units agree over the whole of
 * it. Two passes at worst and one on ordinary prose: the first asks whether
 * there is anything to index at all, and only a text that answers yes is walked
 * a second time to say where.
 */
export function astralIndex(text: string): AstralIndex {
  let pairs = 0;
  for (let at = 0; at < text.length; at += 1) {
    if (opensPair(text, at)) {
      pairs += 1;
      at += 1;
    }
  }
  if (pairs === 0) return null;

  const positions = new Uint32Array(pairs);
  let found = 0;
  let codePoint = 0;
  for (let at = 0; at < text.length; at += 1) {
    if (opensPair(text, at)) {
      positions[found] = codePoint;
      found += 1;
      at += 1;
    }
    codePoint += 1;
  }
  return positions;
}

/**
 * The length of the text the index was built over, in code points. It is the
 * UTF-16 length less the number of pairs, and the formula holds because the
 * text has already been through canonicalisation: an unpaired surrogate would
 * make "minus the pairs" the wrong answer, and by here there are none.
 */
export function cpLengthOf(text: string, index: AstralIndex): number {
  return text.length - (index?.length ?? 0);
}

/**
 * How many entries of the index lie strictly below `codePoint`. Strictly, and
 * that is the whole of the difference between this working and this being
 * subtly wrong: an inclusive comparison would count a character that begins at
 * exactly the position asked about and hand back the position of its low
 * surrogate - an offset into the middle of a character. It shows up only when a
 * finding starts on an emoji or a mathematical letter, which is exactly the
 * text nobody tries.
 */
function pairsBelow(index: Uint32Array, codePoint: number): number {
  let low = 0;
  let high = index.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((index[middle] ?? 0) < codePoint) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** A code-point offset as a position in the string the index was built over. */
export function toDocOffset(index: AstralIndex, offset: CpOffset): DocOffset {
  if (index === null) return offset as unknown as DocOffset;
  return (offset + pairsBelow(index, offset)) as unknown as DocOffset;
}

/**
 * The other direction, which collapses rather than round-trips: there is no
 * code-point offset for a position inside a surrogate pair, so one falls back
 * to the start of the character it is inside. Going forward and then back
 * returns the offset that went in; going back and then forward from the middle
 * of a pair does not, and cannot.
 */
export function toCpOffset(index: AstralIndex, offset: DocOffset): CpOffset {
  if (index === null) return offset as unknown as CpOffset;
  let low = 0;
  let high = index.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((index[middle] ?? 0) + middle < offset) low = middle + 1;
    else high = middle;
  }
  return (offset - low) as unknown as CpOffset;
}

/**
 * Whether both edges of a place are numbers a document could have. Numbers off
 * the wire are not assumed to be reasonable, and they are not clamped either: a
 * clamp turns a broken answer into a plausible point at the edge of the
 * document, which is the kind of wrong that reads as working.
 */
export function withinDocument(from: number, to: number, cpLength: number): boolean {
  return (
    Number.isSafeInteger(from) &&
    Number.isSafeInteger(to) &&
    from >= 0 &&
    from <= to &&
    to <= cpLength
  );
}
