import { diff, presentableDiff } from "@codemirror/merge";

import { countLines, diffLimits, type DiffChange, type DiffResult } from "./text";

/**
 * Comparing two texts, away from the screen.
 *
 * This is the half of the comparison that costs: two versions of a thesis are
 * six million characters between them, and working out what changed is one pass
 * over both of them in full. Virtualised drawing solves how much is painted and
 * solves nothing here, so the pass happens in a worker and what reaches the page
 * is a finished set of changes.
 *
 * The pass is over lines, not over characters, and that is the whole of why it
 * works at this size. A character comparison of two versions of a thesis has to
 * give up long before it finds anything: measured, it answers "everything
 * between the first edit and the last is one change" in three milliseconds, and
 * the setting that would make it answer properly takes a minute on two
 * documents that have nothing in common. Over lines the same algorithm has a
 * few tens of thousands of items instead of three million, the hundred edits in
 * a revised thesis are a hundred changes, and it is done in thirty
 * milliseconds.
 *
 * Then each changed run of lines is compared character by character, which is
 * what puts the marks under the words that moved. That pass is over a few
 * hundred characters at a time, which is the size the character algorithm is
 * good at.
 *
 * The module is pure - two strings in, a list of ranges out - which is what lets
 * a worker run it and a test run it without one.
 */

/**
 * How far the line comparison looks before it gives up and answers coarsely.
 *
 * Measured on a thesis of thirty thousand lines: a hundred scattered edits are
 * found in 30 ms and a thousand in 700 ms, while two documents with nothing in
 * common are given up on after about two seconds. Twice this number buys a
 * precise answer on a five-thousand-line rewrite and costs twelve seconds for
 * it, and a rewrite that size is nearer to another document than to a revision,
 * where the coarse answer is the honest one.
 */
const LINE_SCAN_LIMIT = 10_000;

/**
 * The same setting for the character pass inside a changed run of lines. It is
 * the merge package's own default, written out because a configuration of ours
 * replaces that default rather than adding to it.
 */
const TEXT_SCAN_LIMIT = 500;

/**
 * Each line is encoded as one code point above the basic plane, so a line is
 * exactly two units of the encoded string and a position in it divides by two
 * into a line number. Nothing in that range is a lone surrogate, and it holds a
 * million distinct lines - five times the ceiling a pane accepts.
 */
const FIRST_ID = 0x10000;

/** What changed between two texts. */
export function compare(a: string, b: string): DiffResult {
  const lines = { a: countLines(a), b: countLines(b) };
  if (lines.a > diffLimits.maxLines || lines.b > diffLimits.maxLines) {
    return { changes: [], lines, overLimit: true };
  }

  const startsA = lineStarts(a);
  const startsB = lineStarts(b);
  const ids = new Map<string, number>();
  const changes: DiffChange[] = [];

  for (const run of diff(encode(a, startsA, ids), encode(b, startsB, ids), {
    scanLimit: LINE_SCAN_LIMIT,
  })) {
    // Back from the encoded sequence to the two texts. A run covers whole
    // lines, so it begins where its first line begins and ends where the line
    // after it does - which is what makes an inserted line carry its own line
    // break instead of borrowing the one before it.
    const from = { a: at(startsA, run.fromA / 2, a), b: at(startsB, run.fromB / 2, b) };
    const to = { a: at(startsA, run.toA / 2, a), b: at(startsB, run.toB / 2, b) };
    for (const change of withinRun(a, b, from, to)) changes.push(change);
  }

  return { changes, lines, overLimit: false };
}

/**
 * One changed run of lines, compared character by character so that the words
 * that moved are marked rather than the whole line.
 *
 * Three runs are left whole instead. A run that is empty on one side is a plain
 * insertion or deletion and has nothing to compare against; a run holding a
 * line of more than a few thousand characters is one where the marks are a
 * scatter of lit patches in a wall of text and cost the square of the length to
 * find; and a run so large that it is itself the coarse answer to a failed
 * comparison has nothing finer inside it to say.
 */
function withinRun(
  a: string,
  b: string,
  from: { readonly a: number; readonly b: number },
  to: { readonly a: number; readonly b: number },
): readonly DiffChange[] {
  const whole = [{ fromA: from.a, toA: to.a, fromB: from.b, toB: to.b }];
  if (from.a === to.a || from.b === to.b) return whole;

  const textA = a.slice(from.a, to.a);
  const textB = b.slice(from.b, to.b);
  if (
    longestLine(textA) > diffLimits.maxWordDiffLineChars ||
    longestLine(textB) > diffLimits.maxWordDiffLineChars
  ) {
    return whole;
  }

  return presentableDiff(textA, textB, { scanLimit: TEXT_SCAN_LIMIT }).map((change) => ({
    fromA: from.a + change.fromA,
    toA: from.a + change.toA,
    fromB: from.b + change.fromB,
    toB: from.b + change.toB,
  }));
}

/**
 * The two texts as sequences of lines, where a line that has been seen before
 * is the same item as the one before it. Building the table over both texts in
 * turn is what makes an unchanged line compare equal across them.
 */
function encode(
  text: string,
  starts: readonly number[],
  ids: Map<string, number>,
): string {
  const encoded: string[] = [];
  for (let line = 0; line < starts.length; line += 1) {
    const from = starts[line] ?? 0;
    const to = (starts[line + 1] ?? text.length + 1) - 1;
    const content = text.slice(from, to);
    let id = ids.get(content);
    if (id === undefined) {
      id = FIRST_ID + ids.size;
      ids.set(content, id);
    }
    encoded.push(String.fromCodePoint(id));
  }
  return encoded.join("");
}

/** Where a line begins in the text it came from; past the last, the end. */
function at(starts: readonly number[], line: number, text: string): number {
  return line >= starts.length ? text.length : (starts[line] ?? 0);
}

/** The offset each line begins at, so a line number can be turned into one. */
function lineStarts(text: string): readonly number[] {
  const starts = [0];
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) {
    starts.push(at + 1);
  }
  return starts;
}

function longestLine(text: string): number {
  let longest = 0;
  let from = 0;
  for (;;) {
    const next = text.indexOf("\n", from);
    const end = next === -1 ? text.length : next;
    longest = Math.max(longest, end - from);
    if (next === -1) return longest;
    from = next + 1;
  }
}
