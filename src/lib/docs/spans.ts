import { type BibSpan, type PageSpan } from "@/lib/domain";

/**
 * Turning an offset into something a person can be told: a line, a page, an
 * entry of a bibliography. Every one of these numbers is worked out here, in
 * the browser, from the maps that were built when the document was read - none
 * of them travels over the wire in either direction.
 *
 * They live beside the documents rather than beside the report, because both
 * the card on the results screen and the file assembled on download ask the
 * same questions, and two answers to "which page is this on" is one answer too
 * many.
 */

/**
 * Where every line of a document begins, in code points. It is built once per
 * document and then answered from, because a report over a dissertation asks
 * the same question a thousand times over the same three million characters,
 * and walking the whole text again for each finding is minutes of a tab that
 * has stopped responding.
 */
export function lineStarts(text: string): readonly number[] {
  const starts = [0];
  let offset = 0;
  // Iterating a string yields code points, which is the unit every offset in
  // an answer is counted in.
  for (const character of text) {
    offset += 1;
    if (character === "\n") starts.push(offset);
  }
  return starts;
}

/** The line an offset falls on, over an index built by `lineStarts`. */
export function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}

/**
 * The line an offset falls on. Computed here from the text the browser holds:
 * line numbers do not travel over the wire in either direction.
 */
export function lineOf(text: string, offset: number): number {
  return lineAt(lineStarts(text), offset);
}

export function pageOf(
  pages: readonly PageSpan[] | undefined,
  offset: number,
): number | null {
  if (pages === undefined) return null;
  const span = pages.find((page) => offset >= page.from && offset < page.to);
  return span?.page ?? null;
}

/**
 * The entry of a bibliography a key names. The key comes from the module and
 * the span from our own reading of the file, so a key we have no entry for is
 * an ordinary answer: the finding keeps the key as its place and loses only the
 * offsets behind it.
 */
export function bibSpanOf(
  entries: readonly BibSpan[] | undefined,
  key: string,
): BibSpan | null {
  return entries?.find((entry) => entry.key === key) ?? null;
}
