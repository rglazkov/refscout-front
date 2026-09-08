import { describe, expect, it } from "vitest";

import { type BiblioRecord, type CitationRecord } from "@/lib/domain";
import { risFromRecords, toRis } from "@/lib/export";
import { readCitations } from "@/lib/parse/bib";

import { AWKWARD_BIB, BROKEN_BIB } from "./corpus";

/**
 * A bibliography written out as RIS, which is what a person writing in Word
 * gets instead of a `.bib`. They cite through Zotero, Mendeley or EndNote, and
 * that is the file those import.
 *
 * Two ways in, and both end at the same writer. A bibliography of the person's
 * own is read for its fields first; a list of records kept out of a search
 * already has fields and needs no reading. What is asked here is that the file
 * that comes out is one a reader can take: the tags in the shape the format
 * fixes, an entry that opens with its kind and closes with `ER`, and nothing
 * written for a field the entry did not have.
 */
function tagsOf(ris: string): readonly string[] {
  return ris
    .split("\r\n")
    .filter((line) => line !== "")
    .map((line) => line.slice(0, 2));
}

function valueOf(ris: string, tag: string): string | undefined {
  const line = ris.split("\r\n").find((row) => row.startsWith(`${tag}  - `));
  return line?.slice(6);
}

const RECORD: CitationRecord = {
  type: "article-journal",
  title: "On the estimation of variance",
  authors: ["Smith, Jane"],
  editors: [],
  year: "2019",
  container: "Journal of Machine Learning Research",
  volume: "20",
  pages: "31--47",
  doi: "10.1000/xyz",
  keywords: [],
};

describe("a bibliography written out as RIS", () => {
  it("opens with the kind of work and closes the entry", () => {
    const ris = toRis([RECORD]);
    const tags = tagsOf(ris);
    expect(tags[0]).toBe("TY");
    expect(tags.at(-1)).toBe("ER");
    expect(valueOf(ris, "TY")).toBe("JOUR");
  });

  it("ends every line the way the format's readers expect", () => {
    /*
     * RIS is an EndNote format and its readers were written against files that
     * end their lines with a carriage return and a line feed. Zotero forgives a
     * bare line feed and the older readers do not, and a person whose import
     * fails has no way of finding out why.
     */
    const ris = toRis([RECORD]);
    expect(ris.includes("\r\n")).toBe(true);
    expect(ris.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("writes a page range as its two ends", () => {
    const ris = toRis([RECORD]);
    expect(valueOf(ris, "SP")).toBe("31");
    expect(valueOf(ris, "EP")).toBe("47");
  });

  it("leaves out a field the entry did not have", () => {
    // An empty `VL` in a reference manager reads as a fact about the work.
    const ris = toRis([{ ...RECORD, volume: undefined, pages: undefined }]);
    expect(tagsOf(ris)).not.toContain("VL");
    expect(tagsOf(ris)).not.toContain("SP");
  });

  it("folds a value that runs over several lines onto one", () => {
    // A bare line feed inside a value ends the field as far as a reader is
    // concerned, and an abstract copied out of a PDF is full of them.
    const ris = toRis([{ ...RECORD, abstract: "One line\nand another\n\nand more" }]);
    expect(valueOf(ris, "AB")).toBe("One line and another and more");
  });

  it("separates one entry from the next", () => {
    const ris = toRis([RECORD, { ...RECORD, title: "A second work" }]);
    expect(ris.split("TY  - ")).toHaveLength(3);
  });

  it("calls a work whose kind it does not know a generic reference", () => {
    // Refusing the entry would lose it; `GEN` is the format's own word for
    // this, and a reader shows it rather than dropping it.
    expect(valueOf(toRis([{ ...RECORD, type: "entry-dictionary" }]), "TY")).toBe("GEN");
  });
});

describe("a bibliography of the person's own, converted", () => {
  it("reads the fields out of the file and writes them again", () => {
    const entries = readCitations(AWKWARD_BIB);
    // Two entries under one key: neither is dropped, because which one a
    // citation reaches is exactly the problem being reported elsewhere.
    expect(entries).toHaveLength(2);

    const ris = toRis(entries);
    expect(ris).toContain("TI  - On the estimation of variance");
    expect(ris).toContain("PY  - 2019");
    // The `@string` abbreviation used as a field value is resolved by the
    // reader, which is the whole reason a library reads this format and we
    // do not.
    expect(ris).toContain("JO  - Journal of Machine Learning Research");
  });

  it("puts a name back together from the parts the entry separated", () => {
    // Not a rearrangement of somebody's name: the entry itself said which part
    // is the family name, and this writes it in the order the format expects.
    const ris = toRis(readCitations(AWKWARD_BIB));
    expect(ris).toContain("AU  - Smith, Jane");
    // The accent written as `{\'e}` in the file, decoded by the reader: the
    // library is here for exactly this, and a parser of ours would not be.
    expect(ris).toContain("AU  - O'Neill, Séan");
  });

  it("refuses a file it could not read rather than writing half of it", () => {
    /*
     * Half a bibliography written out as a file is worse than a refusal: the
     * person gets a file, imports it, and finds out which entries are missing
     * when they are missing from their manuscript.
     */
    expect(() => readCitations(BROKEN_BIB)).toThrow();
  });
});

describe("the sources a search found, exported", () => {
  const found: BiblioRecord = {
    title: "Attention Revisited",
    authors: ["Jane Smith", "Sean O'Neill"],
    year: 2019,
    venue: "NeurIPS",
    doi: "10.1000/abc",
    url: "https://example.org/paper",
    openAccess: true,
    sources: ["crossref"],
  };

  it("writes what a card holds and invents nothing else", () => {
    const ris = risFromRecords([found]);
    expect(valueOf(ris, "TY")).toBe("JOUR");
    expect(valueOf(ris, "TI")).toBe("Attention Revisited");
    expect(valueOf(ris, "JO")).toBe("NeurIPS");
    expect(valueOf(ris, "DO")).toBe("10.1000/abc");
    // A card never held a volume, an issue or a page range, so the file says
    // nothing about them.
    expect(tagsOf(ris)).not.toContain("VL");
    expect(tagsOf(ris)).not.toContain("SP");
  });

  it("writes the names as the search gave them", () => {
    /*
     * They arrive as one string each and are written as they stand. A rule that
     * turned "Jane Smith" into "Smith, Jane" would turn "Ludwig van Beethoven"
     * into "Beethoven, Ludwig van" on a good day and into nonsense on an
     * ordinary one.
     */
    const ris = risFromRecords([found]);
    expect(ris).toContain("AU  - Jane Smith");
    expect(ris).toContain("AU  - Sean O'Neill");
  });
});
