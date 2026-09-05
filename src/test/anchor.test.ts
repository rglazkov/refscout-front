import { beforeEach, describe, expect, it } from "vitest";

import {
  astralIndex,
  foldedForm,
  buildIndex,
  MIN_KEY_LENGTH,
  nfcForm,
  occurrences,
  projectAnchor,
  resolveAnchors,
  toCpOffset,
  toDocOffset,
  type ProjectedAnchor,
} from "@/lib/anchor";
import {
  clearEdits,
  clearSnapshots,
  editedWithin,
  movedBy,
  projectOffset,
  recordEdits,
  recordSnapshot,
} from "@/lib/docs";
import {
  asCpOffset,
  asDocOffset,
  type Anchor,
  type BibSpan,
  type Place,
} from "@/lib/domain";

/**
 * How a finding gets from an answer onto the text, and what happens at each of
 * the places where it can go wrong.
 *
 * The texts here are deliberately awkward. On English prose a code point and a
 * unit of a JavaScript string are the same number, so every defect in the
 * conversion is invisible; the fixtures therefore carry emoji, Chinese, a
 * mathematical alphabet and a letter written as a letter plus its accent, which
 * are exactly the four ways a manuscript breaks the arithmetic.
 */
const DOC = "doc";

function place(
  text: string,
  anchors: readonly ProjectedAnchor[],
  options: { readonly bibEntries?: readonly BibSpan[]; readonly budgetMs?: number } = {},
): readonly Place[] {
  const resolved = resolveAnchors({
    texts: { [DOC]: text },
    bibEntries: options.bibEntries === undefined ? {} : { [DOC]: options.bibEntries },
    issues: [{ issueId: "one", anchors }],
    ...(options.budgetMs === undefined ? {} : { budgetMs: options.budgetMs }),
  });
  return resolved.places.one ?? [];
}

/** A range place, given where the fragment actually is in the text. */
function rangeAt(
  text: string,
  from: number,
  to: number,
  context = 64,
  quote = text.slice(from, to),
): ProjectedAnchor {
  return {
    kind: "range",
    docId: DOC,
    from: asDocOffset(from),
    to: asDocOffset(to),
    quote,
    prefix: text.slice(Math.max(0, from - context), from),
    suffix: text.slice(to, to + context),
  };
}

describe("the two units, and the one place they are converted", () => {
  it("a text with nothing above the basic plane needs no index at all", () => {
    expect(astralIndex("plain english prose")).toBeNull();
    expect(astralIndex("汉字也一样")).toBeNull();
  });

  it("an offset is moved by the characters below it that take two units", () => {
    const text = "𝄞a𝄞b";
    const index = astralIndex(text);
    expect(index).toEqual(new Uint32Array([0, 2]));
    // The first character of the text is at nought in both units; everything
    // after each pair moves on by one more.
    expect(toDocOffset(index, asCpOffset(0))).toBe(0);
    expect(toDocOffset(index, asCpOffset(1))).toBe(2);
    expect(toDocOffset(index, asCpOffset(2))).toBe(3);
    expect(toDocOffset(index, asCpOffset(4))).toBe(6);
  });

  it("the comparison is strict, and this is where it is got wrong", () => {
    /*
     * A place that begins exactly on an emoji is the case that separates the
     * two forms of the test. Counting the character at the offset itself would
     * hand back the position of its second half - an offset into the middle of
     * a character - and the highlight would begin one unit late on every
     * finding that starts on a formula or an emoji.
     */
    const index = astralIndex("😀tail");
    expect(toDocOffset(index, asCpOffset(0))).toBe(0);
    expect(toDocOffset(index, asCpOffset(1))).toBe(2);
  });

  it("going forward and back gives the offset that went in", () => {
    const text = "a😀b𝄞c";
    const index = astralIndex(text);
    for (let cp = 0; cp <= 5; cp += 1) {
      expect(toCpOffset(index, toDocOffset(index, asCpOffset(cp)))).toBe(cp);
    }
  });

  it("a position inside a pair collapses to the start of its character", () => {
    // There is no code-point offset for the middle of a character, so the
    // nearest true answer is the character it is inside.
    const index = astralIndex("😀x");
    expect(toCpOffset(index, asDocOffset(1))).toBe(0);
    expect(toCpOffset(index, asDocOffset(2))).toBe(1);
  });
});

describe("the forms a search falls back to", () => {
  it("composes a letter written as a letter and its accent", () => {
    const decomposed = "étude";
    expect(nfcForm(decomposed).text).toBe("étude");
    // And the map says where each unit of the result came from, so a match in
    // the composed form comes back as a range in the document.
    expect(nfcForm(decomposed).map[1]).toBe(2);
  });

  it("flattens what a text pipeline flattens, and nothing that carries meaning", () => {
    const folded = foldedForm("Soft­hyphen “Quoted” — Dash here");
    expect(folded.text).toBe('softhyphen "quoted" - dash here');
  });

  it("leaves the joiners that decide how letters join", () => {
    // Dropping them would glue two words into one search key in Arabic,
    // Persian and the scripts of India.
    expect(foldedForm("‌‍").text).toBe("‌‍");
  });

  it("a line break with the spaces around it becomes one space", () => {
    expect(foldedForm("one \n   two").text).toBe("one two");
  });

  it("a range in the folded form comes back as a range in the document", () => {
    const text = "one  “two”";
    const folded = foldedForm(text);
    const at = folded.text.indexOf('"two"');
    expect(text.slice(folded.map[at] ?? 0, folded.map[at + 5] ?? 0)).toBe("“two”");
  });
});

describe("the index that makes a search cost a lookup rather than a scan", () => {
  const text = `${"padding ".repeat(50)}a distinctive phrase of some length${" tail".repeat(50)}`;

  it("finds a fragment wherever it is, by the windows off its own head", () => {
    const needle = "a distinctive phrase of some length";
    expect(needle.length).toBeGreaterThanOrEqual(MIN_KEY_LENGTH);
    expect(occurrences(buildIndex(text), needle)).toEqual([text.indexOf(needle)]);
  });

  it("counts a second occurrence, which is what ambiguity is made of", () => {
    const twice = `${text}\n${text}`;
    expect(
      occurrences(buildIndex(twice), "a distinctive phrase of some length"),
    ).toHaveLength(2);
  });

  it("a fragment shorter than a window cannot be looked up at all", () => {
    expect(occurrences(buildIndex(text), "short")).toEqual([]);
  });
});

describe("the resolver places what it can and refuses the rest", () => {
  const prose = `Introduction. ${"Filler sentence about the subject. ".repeat(20)}`;
  const text = `${prose}The claim needing a citation appears here.${" More prose follows.".repeat(20)}`;
  const from = text.indexOf("The claim needing a citation");
  const to = from + "The claim needing a citation appears here.".length;

  it("coordinates that hold the quoted text are taken as they are", () => {
    const [only] = place(text, [rangeAt(text, from, to)]);
    expect(only?.status).toBe("exact");
    expect(only?.range).toEqual({ from, to });
  });

  it("coordinates that have moved find the fragment again and say so", () => {
    // The person inserted a paragraph above it after the check was started, so
    // the offsets point a little short of the fragment.
    const [only] = place(text, [
      rangeAt(text, from - 12, to - 12, 0, text.slice(from, to)),
    ]);
    expect(only?.status).toBe("relocated");
    expect(only?.range).toEqual({ from, to });
  });

  it("a fragment that occurs twice and cannot be told apart is refused", () => {
    /*
     * The alternative is a highlight in the wrong paragraph, and one of those
     * costs the reader their trust in every other highlight: they have no way
     * of checking any of them.
     */
    const twice = `${text}\n${text}`;
    const anchor: ProjectedAnchor = {
      kind: "quote",
      docId: DOC,
      quote: "The claim needing a citation appears here.",
    };
    const [only] = place(twice, [anchor]);
    expect(only?.status).toBe("lost");
    expect(only?.failure).toBe("AMBIGUOUS");
  });

  it("the same fragment twice is still placed when the context tells them apart", () => {
    const twice = `first: ${"x".repeat(80)} the shared sentence here. ${"y".repeat(80)} second: the shared sentence here.`;
    const at = twice.lastIndexOf("the shared sentence here.");
    const [only] = place(twice, [
      {
        kind: "quote",
        docId: DOC,
        quote: "the shared sentence here.",
        prefix: twice.slice(at - 20, at),
        suffix: "",
      },
    ]);
    expect(only?.status).toBe("relocated");
    expect(only?.range?.from).toBe(at);
  });

  it("a single candidate near where it should be is taken, however often it repeats", () => {
    /*
     * "Smith et al. [22]" repeats through a thesis by nature. A comparison that
     * missed by a few characters means the place moved, not that another
     * occurrence was meant - and the window is what says so.
     */
    const repeated =
      `${"Smith et al. [22]" + " and more words here.".repeat(20)} `.repeat(10);
    const at = repeated.indexOf("Smith et al. [22]", 500);
    const [only] = place(repeated, [
      {
        kind: "range",
        docId: DOC,
        from: asDocOffset(at + 3),
        to: asDocOffset(at + 20),
        quote: "Smith et al. [22]",
        prefix: "",
        suffix: "",
      },
    ]);
    expect(only?.status).toBe("relocated");
    expect(only?.range?.from).toBe(at);
  });

  it("a key too short to index and with no context is the module's defect", () => {
    const [only] = place(text, [{ kind: "quote", docId: DOC, quote: "[22]" }]);
    expect(only?.status).toBe("lost");
    expect(only?.failure).toBe("ANCHOR_KEY_TOO_SHORT");
  });

  it("a module working on its own reading of the text is still placed", () => {
    /*
     * The soft hyphen, the line break inside a sentence and the typographic
     * quotation marks are ours; the module read a version with none of them.
     * Without the forgiving comparison this whole class of findings would be
     * unplaceable by construction rather than by accident.
     */
    const ours = `Before. The mea­surement of the “sample”\nwas repeated twice. After.`;
    const theirs = 'The measurement of the "sample" was repeated twice.';
    const [only] = place(ours, [
      { kind: "quote", docId: DOC, quote: theirs, prefix: "Before. ", suffix: " After." },
    ]);
    expect(only?.status).toBe("relocated");
    expect(ours.slice(only?.range?.from, only?.range?.to)).toContain("mea­surement");
  });

  it("an entry of a bibliography comes from our own map", () => {
    const bib = "@article{smith2019,\n  title = {Attention}\n}\n";
    const [only] = place(bib, [{ kind: "bibkey", docId: DOC, bibkey: "smith2019" }], {
      bibEntries: [
        { key: "smith2019", from: asDocOffset(0), to: asDocOffset(bib.length) },
      ],
    });
    expect(only?.status).toBe("derived");
    expect(only?.bibkey).toBe("smith2019");
  });

  it("a key with no entry and no literal occurrence is refused rather than guessed", () => {
    const [only] = place("a reference list typed out by hand", [
      { kind: "bibkey", docId: DOC, bibkey: "smith2019" },
    ]);
    expect(only?.status).toBe("lost");
  });

  it("an insertion point is checked against the text on either side of it", () => {
    const at = text.indexOf("appears here.");
    const [only] = place(text, [
      {
        kind: "point",
        docId: DOC,
        at: asDocOffset(at),
        prefix: text.slice(at - 40, at),
        suffix: text.slice(at, at + 40),
      },
    ]);
    expect(only?.status).toBe("exact");
    expect(only?.range?.from).toBe(at);
  });

  it("a finding about the document as a whole has no address, and that is not a failure", () => {
    const [only] = place(text, [{ kind: "none", docId: DOC }]);
    expect(only?.status).toBe("none");
    expect(only?.anchor).toBeUndefined();
  });

  it("an empty range is trusted only where everything checkable checked out", () => {
    const clean = place(text, [
      rangeAt(text, from, to),
      {
        kind: "range",
        docId: DOC,
        from: asDocOffset(10),
        to: asDocOffset(10),
        quote: "",
      },
    ]);
    expect(clean[1]?.status).toBe("exact");

    const doubted = place(text, [
      rangeAt(text, from, to, 64, "text that is not there at all, honestly"),
      {
        kind: "range",
        docId: DOC,
        from: asDocOffset(10),
        to: asDocOffset(10),
        quote: "",
      },
    ]);
    // One range of this document did not hold what it said it held, so an
    // offset with nothing to check it against is arithmetic that has already
    // been shown wrong once here.
    expect(doubted[1]?.status).toBe("lost");
  });

  it("offsets outside the document are refused rather than pulled to its edge", () => {
    // A clamp would turn a broken answer into a plausible point at the end of
    // the manuscript, which reads as a result.
    const anchor: Anchor = {
      kind: "range",
      from: asCpOffset(9_000_000),
      to: asCpOffset(9_000_100),
      quote: "x".repeat(100),
    };
    recordSnapshot(DOC, { textSha256: "", cpLength: text.length, astral: null });
    const projected = projectAnchor(anchor, DOC);
    expect(projected.kind === "range" && projected.failure).toBe("OUT_OF_BOUNDS");
    expect(place(text, [projected])[0]?.status).toBe("lost");
  });

  it("a budget that runs out leaves the findings and refuses the places", () => {
    const [only] = place(text, [rangeAt(text, from, to)], { budgetMs: -1 });
    expect(only?.status).toBe("lost");
    expect(only?.failure).toBe("ANCHOR_BUDGET");
  });
});

describe("the fixtures a defect in the arithmetic only shows up on", () => {
  const cases: readonly { readonly name: string; readonly text: string }[] = [
    { name: "emoji", text: `Results 😀 improved. ${"Filler words here. ".repeat(10)}` },
    {
      name: "Chinese",
      text: `研究结果表明这一点。 ${"更多的文本内容在这里。".repeat(10)}`,
    },
    {
      name: "mathematics",
      text: `Let 𝐀 be the matrix 𝐁𝐂. ${"More prose after it. ".repeat(10)}`,
    },
    {
      name: "diacritics",
      text: `Ünïcödé näïve café. ${"Ordinary words follow. ".repeat(10)}`,
    },
  ];

  for (const fixture of cases) {
    it(`places a finding in a text of ${fixture.name}`, () => {
      const tail = fixture.text.length - 40;
      const anchor = rangeAt(fixture.text, tail, fixture.text.length);
      const [only] = place(fixture.text, [anchor]);
      expect(only?.status).toBe("exact");
      expect(fixture.text.slice(only?.range?.from, only?.range?.to)).toBe(
        anchor.kind === "range" ? anchor.quote : "",
      );
    });

    it(`converts a wire offset into the same place in a text of ${fixture.name}`, () => {
      const astral = astralIndex(fixture.text);
      const cpLength = fixture.text.length - (astral?.length ?? 0);
      recordSnapshot(DOC, { textSha256: "", cpLength, astral });
      // The place a module would name: the last ten code points of the text.
      const cpFrom = asCpOffset(cpLength - 10);
      const at = toDocOffset(astral, cpFrom);
      const projected = projectAnchor(
        {
          kind: "range",
          from: cpFrom,
          to: asCpOffset(cpLength),
          quote: fixture.text.slice(at),
        },
        DOC,
      );
      expect(projected.kind === "range" && projected.from).toBe(at);
      expect(place(fixture.text, [projected])[0]?.status).toBe("exact");
    });
  }
});

describe("what was typed since the text was sent", () => {
  beforeEach(() => {
    clearEdits();
    clearSnapshots();
  });

  it("an insertion above a place moves it by exactly the length of the insertion", () => {
    recordEdits(DOC, [{ from: 10, to: 10, length: 5 }]);
    expect(projectOffset(DOC, 100)).toBe(105);
    expect(projectOffset(DOC, 5)).toBe(5);
  });

  it("a deletion above a place moves it back by what was deleted", () => {
    recordEdits(DOC, [{ from: 10, to: 20, length: 0 }]);
    expect(projectOffset(DOC, 100)).toBe(90);
  });

  it("runs of typing collapse instead of accumulating", () => {
    for (let at = 0; at < 20; at += 1) {
      recordEdits(DOC, [{ from: 10 + at, to: 10 + at, length: 1 }]);
    }
    expect(projectOffset(DOC, 100)).toBe(120);
  });

  it("several changes in one transaction are all measured against the same text", () => {
    // A replacement across a multiple selection: both are in the coordinates of
    // the document before either of them happened.
    recordEdits(DOC, [
      { from: 10, to: 12, length: 4 },
      { from: 30, to: 30, length: 3 },
    ]);
    expect(projectOffset(DOC, 100)).toBe(105);
    expect(projectOffset(DOC, 20)).toBe(22);
  });

  it("an offset inside a replaced stretch collapses to the start of it", () => {
    recordEdits(DOC, [{ from: 10, to: 20, length: 2 }]);
    expect(projectOffset(DOC, 15)).toBe(10);
  });

  it("an edit inside a fragment is what says a finding is about text that has gone", () => {
    recordEdits(DOC, [{ from: 50, to: 55, length: 1 }]);
    expect(editedWithin(DOC, 40, 60)).toBe(true);
    expect(editedWithin(DOC, 0, 40)).toBe(false);
    // At the very edge is not inside: typing at the end of a fragment extends
    // the sentence around it.
    expect(editedWithin(DOC, 0, 50)).toBe(false);
  });

  it("one batch alone is what a hand-placed highlight has to catch up with", () => {
    expect(movedBy(100, [{ from: 10, to: 10, length: 5 }])).toBe(105);
    expect(movedBy(5, [{ from: 10, to: 10, length: 5 }])).toBe(5);
  });
});
