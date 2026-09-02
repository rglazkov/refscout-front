import { describe, expect, it } from "vitest";

import { compare } from "@/lib/diff/compare";
import { countLines, diffLimits } from "@/lib/diff/text";

/**
 * The comparison of two versions, at the sizes it is meant for.
 *
 * What is checked here are the properties that hold whatever the algorithm does
 * inside: that an unchanged pair produces nothing, that a changed line is found
 * where it was changed, that the ceiling is expressed in lines and refuses
 * without throwing anything away, and that a line too long to read word by word
 * is marked whole instead.
 */
function lines(count: number, word = "paragraph"): string {
  return Array.from({ length: count }, (_, index) => `${word} ${index}`).join("\n");
}

describe("comparing two versions", () => {
  it("finds nothing between a text and itself", () => {
    const text = lines(500);
    expect(compare(text, text).changes).toEqual([]);
  });

  it("puts the change where the change is", () => {
    const before = "alpha\nbeta\ngamma";
    const after = "alpha\nBETA\ngamma";
    const [change] = compare(before, after).changes;

    expect(change).toBeDefined();
    expect(before.slice(change?.fromA ?? 0, change?.toA ?? 0)).toContain("beta");
    expect(after.slice(change?.fromB ?? 0, change?.toB ?? 0)).toContain("BETA");
  });

  it("counts the lines of both texts", () => {
    const result = compare(lines(120), lines(130));
    expect(result.lines).toEqual({ a: 120, b: 130 });
    expect(result.overLimit).toBe(false);
  });

  it("scattered edits stay separate changes at the size of a thesis", () => {
    /*
     * The case the whole design of this module turns on. Compared character by
     * character, a hundred edits spread through thirty thousand lines come back
     * as one change covering everything between the first and the last, which
     * is an answer nobody can read. Over lines they are a hundred changes.
     */
    const body = (index: number) =>
      `${index} dense retrieval is usually left to a frozen encoder and read by nobody`;
    const before = Array.from({ length: 30_000 }, (_, index) => body(index));
    const after = before.map((line, index) =>
      index % 300 === 17 ? `${line}, revised` : line,
    );

    const result = compare(before.join("\n"), after.join("\n"));
    expect(result.changes.length).toBe(100);
  });

  it("a work of a real size is compared", () => {
    // Forty thousand lines a side is the shape of a thesis, and well under the
    // ceiling: what this asks is that the ceiling is not in the way of the
    // main thing the mode is for.
    const before = lines(40_000);
    const after = `${lines(40_000)}\none more line`;
    const result = compare(before, after);

    expect(result.overLimit).toBe(false);
    expect(result.changes.length).toBeGreaterThan(0);
  });

  it("past the ceiling it says so and cuts nothing", () => {
    const over = lines(diffLimits.maxLines + 1, "x");
    const result = compare(over, "one line");

    expect(result.overLimit).toBe(true);
    expect(result.changes).toEqual([]);
    // The number the pane prints is the number of lines the text has, not a
    // number of lines that were kept.
    expect(result.lines.a).toBe(diffLimits.maxLines + 1);
  });

  it("a line too long to read word by word is marked as a whole line", () => {
    const long = "word ".repeat(diffLimits.maxWordDiffLineChars);
    const before = `first line\n${long}tail\nlast line`;
    const after = `first line\n${long}TAIL\nlast line`;
    const [change] = compare(before, after).changes;

    expect(change).toBeDefined();
    // The whole of the long line, rather than the four characters inside it.
    expect((change?.toA ?? 0) - (change?.fromA ?? 0)).toBeGreaterThan(
      diffLimits.maxWordDiffLineChars,
    );
    expect(before.slice(change?.fromA ?? 0, change?.toA ?? 0)).not.toContain(
      "first line",
    );
  });

  it("counts lines the way the panes print them", () => {
    expect(countLines("")).toBe(1);
    expect(countLines("one")).toBe(1);
    expect(countLines("one\ntwo")).toBe(2);
    expect(countLines("one\ntwo\n")).toBe(3);
  });
});
