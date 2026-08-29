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
} from "@/lib/docs";
import { type ModuleId, moduleIds } from "@/lib/domain";

/**
 * The functions the buffer is built on (M1.3, M1.4). Each of them decides
 * something a screen then shows, and each is cheap to get wrong in a way that
 * is expensive to notice: a role derived the other way round sends the
 * manuscript to BibCheck, and a name sanitised loosely writes a file where the
 * person did not ask for one.
 */
describe("the role is derived from the ticked checks (M1.4.4)", () => {
  /** Every combination of the four checks, which is what the milestone asks for. */
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

  it("a document brought as an input to another document's checks says so", () => {
    expect(roleFromChecks([], { isVenueRequirements: true })).toBe("venue-requirements");
  });
});

describe("what is proposed is read from the content (M1.4.2)", () => {
  it("a bibliography is recognised whatever the extension says", () => {
    const text = "@article{smith2019, title = {Attention} }";
    expect(proposeChecks(text, "txt")).toEqual(["bibcheck"]);
    expect(detectKind(text, "txt")).toBe("bibtex");
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

describe("a document name is sanitised for display and for the file system (M1.3.5)", () => {
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

describe("text is measured in code points (§6)", () => {
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
});

describe("the limits refuse with numbers (M1.3.5)", () => {
  it("a file larger than the limit is refused before it is read", () => {
    expect(refuseBySize(limits.maxFileBytes + 1)?.code).toBe("FILE_TOO_LARGE");
    expect(refuseBySize(1024)).toBeNull();
  });

  it("the fifty-first document is refused, and the number is in the refusal", () => {
    const refusal = refuseByCount(limits.maxDocuments, 1);
    expect(refusal?.code).toBe("TOO_MANY_DOCUMENTS");
    expect(refusal).toMatchObject({ count: limits.maxDocuments + 1 });
  });

  it("one document over its own limit, and a buffer over the whole-buffer limit", () => {
    const huge = "x".repeat(limits.maxDocChars + 1);
    expect(refuseByVolume(huge, 0)?.code).toBe("DOC_TOO_LARGE");
    expect(refuseByVolume("x".repeat(10), limits.maxBufferChars)?.code).toBe(
      "JOB_TOO_LARGE",
    );
  });
});
