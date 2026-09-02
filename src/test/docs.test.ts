import { describe, expect, it } from "vitest";

import {
  countCodePoints,
  countWords,
  detectKind,
  downloadName,
  proposeChecks,
  refuseByCount,
  refuseBySize,
  refuseByVolume,
  roleFromChecks,
  sanitizeDocumentName,
  limits,
  refuseAttachmentBySize,
  refuseAttachmentByVolume,
  selfKind,
} from "@/lib/docs";
import { type ModuleId, moduleIds } from "@/lib/domain";
import { measure } from "@/workers";

/**
 * The functions the buffer is built on. Each of them decides something a screen
 * then shows, and each is cheap to get wrong in a way that is expensive to
 * notice: a role derived the other way round sends the manuscript to BibCheck,
 * and a name sanitised loosely writes a file where the person did not ask for
 * one.
 */
describe("the role is derived from the ticked checks", () => {
  /** Every combination of the four checks. */
  function combinations(): ModuleId[][] {
    const all: ModuleId[][] = [];
    for (let mask = 0; mask < 1 << moduleIds.length; mask += 1) {
      all.push(moduleIds.filter((_, index) => (mask & (1 << index)) !== 0));
    }
    return all;
  }

  it("covers all sixteen combinations without falling through", () => {
    const roles = combinations().map((checks) => roleFromChecks(checks));
    expect(roles).toHaveLength(16);
    expect(roles.filter((role) => role === undefined)).toEqual([]);
  });

  it.each(combinations())("%j", (...checks: ModuleId[]) => {
    const role = roleFromChecks(checks);
    // PreSubmit and Cite are checks of a manuscript, so either of them makes
    // the document one - which is the ordinary case for a .tex carrying its own
    // bibliography, where BibCheck is ticked as well.
    if (checks.includes("presubmit") || checks.includes("cite")) {
      expect(role).toBe("manuscript");
    } else if (checks.includes("bibcheck")) {
      expect(role).toBe("bibliography");
    } else if (checks.includes("glossary")) {
      expect(role).toBe("glossary");
    } else {
      expect(role).toBe("unknown");
    }
  });

  it("a text brought in for a slot takes its role from the slot", () => {
    // It carries no ticks of its own - the check that reads it is ticked on the
    // document it hangs off - so the slot is the only thing that can say what
    // it is.
    expect(roleFromChecks([], { slot: "venue" })).toBe("venue-requirements");
    expect(roleFromChecks([], { slot: "bibcheck" })).toBe("bibliography");
    expect(roleFromChecks([], { slot: "glossary" })).toBe("glossary");
  });

  it("a manuscript with a bibliography hanging off it is the manuscript", () => {
    // Only BibCheck is ticked, and without this the manuscript would take the
    // role of the very thing it brought with it.
    expect(roleFromChecks(["bibcheck"], { hasCompanions: true })).toBe("manuscript");
  });
});

describe("what is proposed is read from the content", () => {
  it("a bibliography is recognised whatever the extension says, and asks for BibCheck", () => {
    // A bibliography brought on its own is a document to be checked: duplicate
    // keys, broken entries and retracted works are answerable without any
    // manuscript, and the manuscript that cites it is what the card then offers
    // to add. The extension has no say in it - the content does.
    const text = "@article{smith2019, title = {Attention} }";
    expect(proposeChecks(text, "txt")).toEqual(["bibcheck"]);
    expect(detectKind(text, "txt")).toBe("bibtex");
    expect(roleFromChecks(["bibcheck"], { self: "bibliography" })).toBe("bibliography");
  });

  it("a bibliography stays a bibliography once it names the manuscript citing it", () => {
    // The link is the same link either way round, so the ticks cannot say which
    // half of the pair this is - what the document itself is says it.
    expect(
      roleFromChecks(["bibcheck"], { self: "bibliography", hasCompanions: true }),
    ).toBe("bibliography");
    expect(roleFromChecks(["bibcheck"], { self: "other", hasCompanions: true })).toBe(
      "manuscript",
    );
    expect(selfKind("bib", "bibtex")).toBe("bibliography");
    expect(selfKind("gls", "latex")).toBe("glossary");
    expect(selfKind("tex", "latex")).toBe("other");
  });

  it("a LaTeX manuscript gets PreSubmit and Cite, and BibCheck when it carries a bibliography", () => {
    const bare = "\\documentclass{article}\n\\begin{document}Hello\\end{document}";
    expect(proposeChecks(bare, "tex")).toEqual(["presubmit", "cite"]);

    const withBibliography = `${bare}\n\\bibliography{refs}`;
    expect(proposeChecks(withBibliography, "tex")).toEqual([
      "bibcheck",
      "presubmit",
      "cite",
    ]);
  });

  it("a file made of acronym declarations is a glossary", () => {
    const gls =
      "\\newacronym{ml}{ML}{machine learning}\n\\newacronym{ai}{AI}{artificial intelligence}";
    expect(proposeChecks(gls, "gls")).toEqual(["glossary"]);
  });

  it("markdown with headings is a manuscript, and plain prose is not", () => {
    expect(proposeChecks("# Title\n\nText.", "md")).toEqual(["presubmit", "cite"]);
    // Long prose with no markup is most often a venue's requirements pasted in,
    // and that is an input to a check rather than a check: nothing is ticked.
    expect(proposeChecks("Manuscripts must be anonymised.", "txt")).toEqual([]);
  });
});

describe("a document name is sanitised for display and for the file system", () => {
  it("a name that climbs out of its folder cannot", () => {
    expect(sanitizeDocumentName("../../etc/passwd.bib")).toBe("etc_passwd.bib");
  });

  it("a right-to-left override is removed rather than rendered", () => {
    const disguised = `report\u202Efdp.exe`;
    const clean = sanitizeDocumentName(disguised);
    expect(clean).not.toContain("\u202E");
    expect(clean).toBe("reportfdp.exe");
  });

  it("a long name keeps its extension", () => {
    const long = `${"a".repeat(200)}.bib`;
    const clean = sanitizeDocumentName(long);
    expect([...clean].length).toBeLessThanOrEqual(80);
    expect(clean.endsWith(".bib")).toBe(true);
  });

  it("a download is named after the document rather than after the browser", () => {
    expect(downloadName("refs.bib", "-bibcheck", "bib")).toBe("refs-bibcheck.bib");
    expect(downloadName("../../etc/passwd.bib", "", "bib")).toBe("etc_passwd.bib");
  });
});

describe("text is measured in code points", () => {
  it("an astral character is one character, not two", () => {
    // The limits are counted in this unit and so is the server. String.length
    // would call this two, and the two sides would disagree exactly where a
    // limit is close.
    expect(countCodePoints("a𝄞b")).toBe(3);
    expect("a𝄞b".length).toBe(4);
  });

  it("words are runs of non-space, in any script", () => {
    expect(countWords("  one   two\nthree ")).toBe(3);
    expect(countWords("   ")).toBe(0);
  });

  /**
   * The counters are taken in one walk where the text is produced, and singly
   * where a person is typing. Two ways of counting the same thing is two
   * numbers: the card would print one and the limit would refuse by the other,
   * and which of them a document was turned away by would depend on how it
   * arrived.
   */
  it("counting everything at once agrees with counting one thing at a time", () => {
    const samples = [
      "",
      "   \n\t ",
      "a𝄞b",
      "  one   two\nthree ",
      "line\u{a0}with\u{2009}unusual\u{3000}spaces",
      "an emoji 👩‍🔬 and a formula ∫₀¹ x²dx",
      "hyphen-joined words, and a run of\n\n\nblank lines",
    ];
    for (const sample of samples) {
      const stats = measure(sample);
      expect(stats.chars).toBe(countCodePoints(sample));
      expect(stats.words).toBe(countWords(sample));
      expect(stats.empty).toBe(sample.trim() === "");
    }
  });
});

describe("the limits refuse with numbers", () => {
  it("a file larger than the limit is refused before it is read", () => {
    expect(refuseBySize(limits.maxFileBytes + 1)?.code).toBe("FILE_TOO_LARGE");
    expect(refuseBySize(1024)).toBeNull();
  });

  it("one document past the limit is refused, and the number is in the refusal", () => {
    const refusal = refuseByCount(limits.maxDocuments, 1);
    expect(refusal?.code).toBe("TOO_MANY_DOCUMENTS");
    expect(refusal).toMatchObject({ count: limits.maxDocuments + 1 });
  });

  it("a check may not be assembled past the ceiling of a check", () => {
    // The slot ceilings alone do not bound the composition: a manuscript at its
    // own limit plus everything hanging off it is what one check reads, and
    // that is what the ceiling is over.
    const room = limits.maxCheckChars - limits.attachment.bibcheck.maxChars;
    expect(refuseAttachmentByVolume("bibcheck", 1, room)).toBeNull();
    expect(
      refuseAttachmentByVolume("bibcheck", 1000, limits.maxCheckChars),
    ).toMatchObject({ code: "CHECK_TOO_LARGE", limit: limits.maxCheckChars });
  });

  it("a bibliography, a glossary file and requirements have ceilings of their own", () => {
    // The buffer holds book-length works; what hangs off one of them is a
    // fraction of its size, and one ceiling for both would let a second
    // dissertation in through the glossary slot.
    for (const slot of ["bibcheck", "glossary", "venue"] as const) {
      const limit = limits.attachment[slot].maxChars;
      expect(limit).toBeLessThan(limits.maxDocChars);
      expect(refuseAttachmentByVolume(slot, limit + 1)).toMatchObject({
        code: "ATTACHMENT_TOO_LARGE",
        slot,
        limit,
      });
      expect(refuseAttachmentByVolume(slot, limit)).toBeNull();
      expect(
        refuseAttachmentBySize(slot, limits.attachment[slot].maxFileBytes + 1)?.code,
      ).toBe("FILE_TOO_LARGE");
    }
  });

  it("one document over its own limit, and a buffer over the whole-buffer limit", () => {
    expect(refuseByVolume(limits.maxDocChars + 1, 0)?.code).toBe("DOC_TOO_LARGE");
    expect(refuseByVolume(10, limits.maxBufferChars)?.code).toBe("JOB_TOO_LARGE");
  });
});
