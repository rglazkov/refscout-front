import { describe, expect, it } from "vitest";

import { readBibtex } from "@/lib/parse/bib";
import { readLatex } from "@/lib/parse/latex";

import {
  AWKWARD_BIB,
  BROKEN_BIB,
  HOSTILE_BIB,
  TEX_WITH_BIBLIOGRAPHY,
  TEX_WITH_INPUT,
} from "./corpus";

/**
 * Reading a bibliography in the browser, which is two things and not one: the
 * map of where each entry sits, and the few problems visible in the file itself.
 *
 * Neither is a check. The text goes to the server as it always would and is
 * checked there; this is what can be said before a run costs anything, and what
 * makes a finding that names an entry key show up in the right place in the
 * document.
 */
describe("a BibTeX file", () => {
  it("finds every entry and where it sits in the text", () => {
    const reading = readBibtex(AWKWARD_BIB);

    // Two entries, both under the same key. Neither is dropped: which one a
    // citation reaches is the problem being reported, and it cannot be reported
    // from one of them.
    expect(reading.bibEntries).toHaveLength(2);
    expect(reading.complete).toBe(true);
    for (const entry of reading.bibEntries) {
      expect(entry.key).toBe("smith2019");
      const span = AWKWARD_BIB.slice(entry.from, entry.to);
      expect(span.startsWith("@article{smith2019")).toBe(true);
      expect(span.endsWith("}")).toBe(true);
    }
  });

  it("leaves the string definitions out of the map", () => {
    // `@string{jmlr = "..."}` is not an entry and has no key of its own. A
    // guessed boundary is worse than a missing one, so it is simply not there.
    const reading = readBibtex(AWKWARD_BIB);
    expect(reading.bibEntries.some((entry) => entry.key === "jmlr")).toBe(false);
  });

  it("reports a key written twice, once, with the count", () => {
    const findings = readBibtex(AWKWARD_BIB).localFindings;
    expect(findings).toEqual([
      {
        code: "BIB_DUPLICATE_KEY",
        severity: "warning",
        params: { key: "smith2019", count: 2 },
      },
    ]);
  });

  it("says nothing about a bibliography with no duplicates in it", () => {
    expect(readBibtex(HOSTILE_BIB).localFindings).toEqual([]);
    expect(readBibtex(HOSTILE_BIB).bibEntries).toHaveLength(1);
  });

  it("a file that does not read as a whole says so and blocks nothing", () => {
    /*
     * The row of the table this is: the text is accepted like any other, the
     * reading of it is switched off, and the card says the lint is off rather
     * than showing an empty list that reads as a clean bill of health.
     */
    const reading = readBibtex(BROKEN_BIB);
    expect(reading.complete).toBe(false);
    expect(reading.bibEntries).toEqual([]);
    expect(reading.localFindings).toEqual([{ code: "BIB_UNREADABLE", severity: "info" }]);
  });

  it("carries no part of a hostile field into what it reports", () => {
    // The one field in this fixture holds markup. Nothing here reports a field
    // at all - a finding carries a key and a count - and that is what makes the
    // question uninteresting rather than carefully handled.
    const findings = readBibtex(HOSTILE_BIB).localFindings;
    expect(JSON.stringify(findings)).not.toContain("<img");
  });
});

describe("a LaTeX source", () => {
  it("maps the entries of a bibliography written inside it", () => {
    const reading = readLatex(TEX_WITH_BIBLIOGRAPHY);
    expect(reading.bibEntries.map((entry) => entry.key)).toEqual([
      "smith2019",
      "jones2020",
    ]);

    const [first, second] = reading.bibEntries;
    expect(TEX_WITH_BIBLIOGRAPHY.slice(first?.from, first?.to)).toContain(
      "On the estimation of variance",
    );
    // The last entry stops at the end of what the environment holds. Running to
    // the environment's own end would swallow the closing command into it.
    const last = TEX_WITH_BIBLIOGRAPHY.slice(second?.from, second?.to);
    expect(last).toContain("An uncited work");
    expect(last).not.toContain("end{thebibliography}");
  });

  it("reads the key rather than the label a reader sees", () => {
    // The second entry is written `[Jo20]{jones2020}`, and the part in square
    // brackets is what appears in the printed list.
    const keys = readLatex(TEX_WITH_BIBLIOGRAPHY).bibEntries.map((entry) => entry.key);
    expect(keys).not.toContain("Jo20");
  });

  it("says nothing about which entries are used", () => {
    /*
     * An entry nothing cites is a finding of the bibliography check, and that
     * check has a setting for whether to report it. Answering the same question
     * here as well would put a second answer beside the server's, looking just
     * like it and disagreeing with it the first time somebody writes
     * `\nocite{*}`.
     */
    expect(readLatex(TEX_WITH_BIBLIOGRAPHY).localFindings).toEqual([]);
  });

  it("finds nothing to map in a source whose bibliography is a separate file", () => {
    // `\bibliography{refs}` names a file that is a document of its own, and its
    // entries are mapped when that document is read.
    const reading = readLatex(TEX_WITH_INPUT);
    expect(reading.bibEntries).toEqual([]);
    expect(reading.localFindings).toEqual([]);
    expect(reading.complete).toBe(true);
  });
});
