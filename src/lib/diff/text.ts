/**
 * What the comparison of two versions is measured in, and the ceilings it works
 * within. They are apart from the comparison itself because a screen has to
 * name them before anything has been compared - and because reaching them
 * through here brings none of the comparison's code with it.
 */
export const diffLimits = {
  /**
   * Lines per pane. Line comparison works over hashes of lines rather than over
   * characters, so the size of the problem is measured in lines: a work of
   * three million characters is a few tens of thousands of them, and nothing
   * written by a person comes near this. What does reach it is a generated
   * file, and past the ceiling the text is neither cut nor thrown away - the
   * pane says how many lines it holds and what the ceiling is.
   */
  maxLines: 200_000,
  /**
   * Beyond this many characters on a line, a change is shown as the whole line
   * rather than as the words inside it. A line this long is a paragraph with no
   * breaks in it or a generated table, and a scatter of highlighted fragments
   * across it reads as nothing at all - while working them out costs the square
   * of the length.
   */
  maxWordDiffLineChars: 4_000,
} as const;

/**
 * A changed range: where it is in the left text and where it is in the right
 * one. It crosses a worker boundary, so it is four numbers and no class.
 *
 * The numbers are positions in the string as the editor counts them, which is
 * the unit the marks are drawn in. They are not the code-point offsets a
 * finding from a check arrives in, and the two are never mixed: nothing here
 * travels over the wire in either direction.
 */
export type DiffChange = {
  readonly fromA: number;
  readonly toA: number;
  readonly fromB: number;
  readonly toB: number;
};

export type DiffResult = {
  readonly changes: readonly DiffChange[];
  readonly lines: { readonly a: number; readonly b: number };
  /**
   * A pane holds more lines than the ceiling allows, so nothing was compared.
   * It is a state of the answer rather than a failure: the texts are on screen
   * and readable, and what is missing is the comparison.
   */
  readonly overLimit: boolean;
};

export function countLines(text: string): number {
  let lines = 1;
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) {
    lines += 1;
  }
  return lines;
}
