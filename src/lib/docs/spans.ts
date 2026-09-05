import { type BibSpan, type DocOffset, type PageSpan } from "@/lib/domain";

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
 * Where every line of a document begins, in the units a string is made of. It
 * is built once per document and then answered from, because a report over a
 * dissertation asks the same question a thousand times over the same three
 * million characters, and walking the whole text again for each finding is
 * minutes of a tab that has stopped responding.
 *
 * A line ends at a line feed and at nothing else, which is what the editor
 * counts and therefore what a person reads off the gutter beside their own
 * text. Other languages draw the boundary in other places - Python also breaks
 * a line on a form feed and on the two Unicode separators - and those
 * characters do occur in these documents: a form feed out of a PDF converted to
 * text, a line separator out of a paste made in Word. They stay in the text,
 * because taking anything out of somebody's manuscript is not ours to do, so
 * the number said here is the number they can see beside the line.
 */
export function lineStarts(text: string): readonly number[] {
  const starts = [0];
  let at = text.indexOf("\n");
  while (at !== -1) {
    starts.push(at + 1);
    at = text.indexOf("\n", at + 1);
  }
  return starts;
}

/** The line an offset falls on, over an index built by `lineStarts`. */
export function lineAt(starts: readonly number[], offset: DocOffset): number {
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
export function lineOf(text: string, offset: DocOffset): number {
  return lineAt(lineStarts(text), offset);
}

export function pageOf(
  pages: readonly PageSpan[] | undefined,
  offset: DocOffset,
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
