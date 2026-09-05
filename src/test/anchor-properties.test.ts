import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";

import {
  astralIndex,
  projectAnchor,
  resolveAnchors,
  toCpOffset,
  toDocOffset,
} from "@/lib/anchor";
import {
  clearEdits,
  clearSnapshots,
  projectOffset,
  recordEdits,
  recordSnapshot,
  type TextEdit,
} from "@/lib/docs";
import { asCpOffset, asDocOffset } from "@/lib/domain";

/**
 * The defects this file is for are the ones examples do not catch, because the
 * sequence of edits that breaks a projection is always the one nobody thought
 * to write down. So the sequences are generated instead, and what is asserted
 * is an invariant rather than an outcome: a place stays on the words it was put
 * on, whatever was typed around it.
 *
 * The alphabets are chosen for the same reason. On English text a code point
 * and a unit of a JavaScript string are the same number and every defect in the
 * conversion is invisible, so the generated texts are made of emoji, Chinese, a
 * mathematical alphabet and a letter written as a letter plus its accent -
 * which is where a manuscript actually breaks the arithmetic.
 */
const ALPHABET = fc.constantFrom("a", "b", " ", ".", "\n", "😀", "汉", "𝐀", "é", "é");

const text = fc.string({ unit: ALPHABET, minLength: 0, maxLength: 60 });

/**
 * A thousand sequences, which is what makes this worth running at all: the
 * counterexample is never in the first dozen. Each one is small enough that the
 * whole file is a fraction of a second, so it belongs in the ordinary run
 * rather than in a lane somebody has to remember to start.
 */
const RUNS = { numRuns: 1_000 };

const DOC = "doc";

/** One edit somewhere in a text, and the text it leaves behind. */
type Applied = { readonly text: string; readonly edits: readonly TextEdit[] };

function edits(document: string): fc.Arbitrary<Applied> {
  return fc
    .array(
      fc.record({
        at: fc.double({ min: 0, max: 1, noNaN: true }),
        length: fc.double({ min: 0, max: 1, noNaN: true }),
        insert: fc.string({ unit: ALPHABET, maxLength: 8 }),
      }),
      { maxLength: 12 },
    )
    .map((steps) => {
      let standing = document;
      const made: TextEdit[] = [];
      for (const step of steps) {
        const from = Math.floor(step.at * standing.length);
        const to = Math.min(
          standing.length,
          from + Math.floor(step.length * (standing.length - from)),
        );
        made.push({ from, to, length: step.insert.length });
        standing = standing.slice(0, from) + step.insert + standing.slice(to);
      }
      return { text: standing, edits: made };
    });
}

beforeEach(() => {
  clearEdits();
  clearSnapshots();
});

describe("the conversion between the two units", () => {
  it("gives back the offset that went in, on any text", () => {
    fc.assert(
      fc.property(text, (document) => {
        const index = astralIndex(document);
        const cpLength = document.length - (index?.length ?? 0);
        for (let cp = 0; cp <= cpLength; cp += 1) {
          expect(toCpOffset(index, toDocOffset(index, asCpOffset(cp)))).toBe(cp);
        }
      }),
      RUNS,
    );
  });

  it("never lands inside a character", () => {
    /*
     * The other direction collapses rather than round-trips, and it has to: a
     * position inside a surrogate pair is not a code point at all. What it must
     * never do is hand back a position that splits a character, because a
     * highlight starting there is drawn over half of one.
     */
    fc.assert(
      fc.property(text, (document) => {
        const index = astralIndex(document);
        const cpLength = document.length - (index?.length ?? 0);
        for (let cp = 0; cp <= cpLength; cp += 1) {
          const at = toDocOffset(index, asCpOffset(cp));
          const code = document.charCodeAt(at - 1);
          expect(code >= 0xd800 && code <= 0xdbff).toBe(false);
        }
      }),
      RUNS,
    );
  });
});

describe("a place under any sequence of edits", () => {
  it("stays inside the document", () => {
    fc.assert(
      fc.property(
        text.chain((document) => fc.tuple(fc.constant(document), edits(document))),
        fc.nat(),
        ([document, applied], offset) => {
          clearEdits();
          for (const edit of applied.edits) recordEdits(DOC, [edit]);
          const at = projectOffset(DOC, offset % (document.length + 1));
          expect(at).toBeGreaterThanOrEqual(0);
          expect(at).toBeLessThanOrEqual(applied.text.length);
        },
      ),
      RUNS,
    );
  });

  it("still brackets the same words after a sequence of edits around it", () => {
    /*
     * The invariant the whole accumulator exists for, and the one examples do
     * not catch: whatever is typed above and below a fragment, and however many
     * times, the two ends of the fragment still name exactly those characters.
     * The edits are kept off the fragment itself - what happens when the words
     * under a finding are the ones being rewritten is a different question, and
     * it has an answer of its own.
     */
    const marked = "the words this finding is about";
    fc.assert(
      fc.property(
        text,
        text,
        fc.array(
          fc.record({
            above: fc.boolean(),
            at: fc.double({ min: 0, max: 1, noNaN: true }),
            remove: fc.nat({ max: 6 }),
            insert: fc.string({ unit: ALPHABET, maxLength: 8 }),
          }),
          { maxLength: 20 },
        ),
        (head, tail, steps) => {
          clearEdits();
          let standing = `${head}${marked}${tail}`;
          let start = head.length;
          let end = start + marked.length;

          for (const step of steps) {
            const room = step.above ? start : standing.length - end;
            if (room === 0) continue;
            const base = step.above ? 0 : end;
            const from = base + Math.floor(step.at * room);
            const to = Math.min(base + room, from + step.remove);
            recordEdits(DOC, [{ from, to, length: step.insert.length }]);
            standing = standing.slice(0, from) + step.insert + standing.slice(to);
            if (step.above) {
              const moved = step.insert.length - (to - from);
              start += moved;
              end += moved;
            }
          }

          expect(projectOffset(DOC, head.length)).toBe(start);
          expect(projectOffset(DOC, head.length + marked.length, -1)).toBe(end);
          expect(standing.slice(start, end)).toBe(marked);
        },
      ),
      RUNS,
    );
  });

  it("moves by exactly the length of what was inserted above it", () => {
    /*
     * Equality, not "the highlight is still on the screen". The whole class of
     * defects this guards against is the one that moves a place by a character
     * or two per emoji above it, and a test that only asked whether something
     * was still highlighted would pass through every one of them.
     */
    fc.assert(
      fc.property(text, text, fc.nat(), (head, inserted, tail) => {
        clearEdits();
        const at = head.length + (tail % 5);
        recordEdits(DOC, [
          { from: head.length, to: head.length, length: inserted.length },
        ]);
        expect(projectOffset(DOC, at)).toBe(at + inserted.length);
        // And nothing above the insertion moves at all.
        if (head.length > 0) {
          expect(projectOffset(DOC, head.length - 1)).toBe(head.length - 1);
        }
      }),
      RUNS,
    );
  });
});

describe("a finding stays on the words it was put on", () => {
  /**
   * A document with one fragment in it that occurs nowhere else, so that there
   * is a right answer to compare against. The edits are made outside it: what
   * is being tested is that the place follows the text, not what happens when
   * the words under it are the ones being rewritten.
   */
  const marked = "the marked fragment of this document";

  it("through any sequence of edits above and below it", () => {
    fc.assert(
      fc.property(text, text, (head, tail) => {
        clearEdits();
        clearSnapshots();
        const document = `${head}${marked}${tail}`;
        const index = astralIndex(document);
        const cpLength = document.length - (index?.length ?? 0);
        recordSnapshot(DOC, { textSha256: "", cpLength, astral: index });

        const at = head.length;
        const anchor = {
          kind: "range" as const,
          from: toCpOffset(index, asDocOffset(at)),
          to: toCpOffset(index, asDocOffset(at + marked.length)),
          quote: marked,
          prefix: head.slice(-64),
          suffix: tail.slice(0, 64),
        };

        // Something typed above the fragment and something below it, neither
        // touching it.
        const insertion = "inserted words here. ";
        const edited = `${insertion}${head}${marked}${tail}${insertion}`;
        // In the order an editor reports them: up the document, every one of
        // them measured against the text as it was before any of them.
        recordEdits(DOC, [
          { from: 0, to: 0, length: insertion.length },
          { from: document.length, to: document.length, length: insertion.length },
        ]);

        const projected = projectAnchor(anchor, DOC);
        const resolved = resolveAnchors({
          texts: { [DOC]: edited },
          bibEntries: {},
          issues: [{ issueId: "one", anchors: [projected] }],
        });
        const place = resolved.places.one?.[0];
        expect(place?.status).toBe("exact");
        expect(edited.slice(place?.range?.from, place?.range?.to)).toBe(marked);
      }),
      // Fewer runs than the arithmetic above: each one builds an index over the
      // document, and what varies here is the text around the fragment rather
      // than a sequence, so the space is smaller.
      { numRuns: 300 },
    );
  });
});
