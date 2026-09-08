import { plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";

import {
  asDocOffset,
  type BibSpan,
  type CitationRecord,
  type LocalFinding,
} from "@/lib/domain";

import { ParseFailure } from "./failure";
import { type Reading, emptyReading, unreadable } from "./reading";

/**
 * BibTeX, read by citation-js.
 *
 * No parser of ours is written for this format and none ever will be. It looks
 * simple exactly until the first real file: `@string` abbreviations used as
 * field values, braces nested three deep inside a title, an apostrophe written
 * as `{\'e}`, and every one of those in a bibliography somebody has been adding
 * to since their first year.
 *
 * What comes out is not the document. The text stays as it was read, character
 * for character - it is the person's file and they get it back - and this adds
 * two things beside it: where each entry sits, so a finding that names a key
 * can be shown in the text, and what is wrong with the file that can be seen
 * without asking anybody.
 */
type Entry = { readonly type?: string; readonly label?: string };

export function readBibtex(text: string): Reading {
  let entries: readonly Entry[];
  try {
    /*
     * The link of the chain that stops at the entries. The rest of citation-js
     * would go on to convert them into CSL, which is a shape for producing
     * citations in a style and answers none of the questions here: what is
     * wanted is the key, the type and the fields the file actually wrote.
     *
     * `@biblatex/text` over `@bibtex/text` because it is the more forgiving of
     * the two on real files while accepting everything the other does.
     */
    entries = plugins.input.chainLink(text, {
      forceType: "@biblatex/text",
    }) as readonly Entry[];
  } catch {
    // A file that would not read as a whole is still a text: it is accepted,
    // sent and checked like any other, and only this reading of it stops.
    return unreadable();
  }

  const keys = entries
    .map((entry) => entry.label)
    .filter((label): label is string => label !== undefined && label !== "");
  if (keys.length === 0) return emptyReading();

  return {
    bibEntries: spansOf(text, new Set(keys)),
    localFindings: duplicateFindings(keys),
    complete: true,
  };
}

/**
 * A key written twice. Which of the two entries a citation reaches is then a
 * question about the order the file happens to be in, and the other one is
 * simply not in the bibliography however long it has been sitting there.
 */
export function duplicateFindings(keys: readonly string[]): readonly LocalFinding[] {
  const counts = new Map<string, number>();
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({
      code: "BIB_DUPLICATE_KEY" as const,
      severity: "warning" as const,
      params: { key, count },
    }));
}

/**
 * Where each entry begins and ends in the file.
 *
 * citation-js reads the entries but says nothing about where they were, and
 * the map has to be in the coordinates of the text - it is what turns a key in
 * a finding into a place in the document. So the entries are found again here,
 * and finding them is not parsing them: the keys are already known, and what is
 * done with them is counting braces from the one that opens the entry. An entry
 * whose key citation-js did not report is not in the map at all, because a
 * guessed boundary is worse than a missing one.
 *
 * The offsets are UTF-16 indices, like the page map beside them: they live with
 * the browser's copy of the document and are carried across an edit by the
 * editor, which counts in the units the browser counts in. Code points are the
 * unit of the wire, and this map never travels.
 */
function spansOf(text: string, keys: ReadonlySet<string>): readonly BibSpan[] {
  const spans: BibSpan[] = [];
  const header = /@[ \t]*([A-Za-z]+)[ \t\r\n]*\{([^,{}]*)[,}]/g;

  for (const match of text.matchAll(header)) {
    const key = (match[2] ?? "").trim();
    if (!keys.has(key)) continue;
    const from = match.index;
    const opening = text.indexOf("{", from);
    const to = closingBrace(text, opening);
    if (to === -1) continue;
    spans.push({ key, from: asDocOffset(from), to: asDocOffset(to) });
  }
  return spans;
}

/**
 * The brace that closes the one at `opening`, or -1 if the file never closes
 * it. A backslash hides the character after it, which is how `\}` inside a
 * title stays inside the title.
 */
function closingBrace(text: string, opening: number): number {
  let depth = 0;
  for (let at = opening; at < text.length; at += 1) {
    const character = text[at];
    if (character === "\\") {
      at += 1;
      continue;
    }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return at + 1;
    }
  }
  return -1;
}

/**
 * The entries of a bibliography with their fields, for writing the file out in
 * another bibliographic format.
 *
 * It is a second reading of the same file rather than a widening of the first,
 * and the two are wanted at different moments. `readBibtex` runs on every parse
 * and after every edit, and it deliberately stops at the entries: what it needs
 * is where they are and what they are called. This runs once, when somebody
 * asks for the file as `.ris`, and it needs the opposite - not where the entry
 * is, but everything inside it - so it runs the whole of citation-js's chain
 * and gets CSL back, which is the shape that has the fields.
 *
 * A file that will not read gives nothing rather than half of itself. Half a
 * bibliography written out as a file is worse than a refusal: the person gets
 * a file, imports it, and finds out which entries are missing when they are
 * missing from their manuscript.
 */
export function readCitations(text: string): readonly CitationRecord[] {
  let items: readonly CslItem[];
  try {
    items = plugins.input.chain(text, {
      forceType: "@biblatex/text",
      // The graph is citation-js's record of which format the entry came
      // through, for turning it back into that format. Nothing here goes back.
      generateGraph: false,
    }) as readonly CslItem[];
  } catch {
    throw new ParseFailure("BIB_CONVERT_FAILED");
  }
  return items.map(citation);
}

/**
 * What is read out of one CSL entry. Every field is checked as it is taken
 * rather than trusted from the shape above: the declaration is our description
 * of a library that ships no types, and a description is not a guarantee.
 */
function citation(item: CslItem): CitationRecord {
  const issued = item.issued;
  const year =
    issued?.["date-parts"]?.[0]?.[0] ?? text(issued?.literal) ?? text(issued?.raw);

  return {
    type: text(item.type) ?? "document",
    ...field("title", item.title),
    authors: names(item.author),
    editors: names(item.editor),
    ...(year === undefined ? {} : { year: String(year) }),
    ...field("container", item["container-title"]),
    ...field("volume", item.volume),
    ...field("issue", item.issue),
    ...field("pages", item.page),
    ...field("publisher", item.publisher),
    ...field("place", item["publisher-place"]),
    ...field("edition", item.edition),
    ...field("issn", item.ISSN),
    ...field("isbn", item.ISBN),
    ...field("doi", item.DOI),
    ...field("url", item.URL),
    ...field("abstract", item.abstract),
    // CSL keeps them as one string with commas in it, which is one keyword as
    // far as a reader is concerned.
    keywords: (text(item.keyword) ?? "")
      .split(",")
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword !== ""),
    ...field("note", item.note),
  };
}

/**
 * A name put back together from its parts, in the order a bibliographic format
 * expects it. The parts are what the entry itself separated, so this is not a
 * rearrangement of somebody's name - it is the entry's own answer to which part
 * is the family name. An entry that gave the name as one string kept it as one
 * string, and so do we.
 */
function names(list: readonly CslName[] | undefined): readonly string[] {
  if (list === undefined) return [];
  return list
    .map((name) => {
      const literal = text(name.literal);
      if (literal !== undefined) return literal;
      const family = [text(name["non-dropping-particle"]), text(name.family)]
        .filter((part) => part !== undefined)
        .join(" ");
      const given = text(name.given);
      if (family === "") return given ?? "";
      return given === undefined ? family : `${family}, ${given}`;
    })
    .filter((name) => name !== "");
}

/** A value that is a non-empty string, or nothing at all. */
function text(value: unknown): string | undefined {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** The field, or no field - never a field holding an empty string. */
function field<K extends string>(
  name: K,
  value: unknown,
): Partial<Record<K, string>> | Record<string, never> {
  const kept = text(value);
  return kept === undefined ? {} : ({ [name]: kept } as Record<K, string>);
}

type CslName = {
  readonly family?: unknown;
  readonly given?: unknown;
  readonly literal?: unknown;
  readonly "non-dropping-particle"?: unknown;
};

type CslItem = {
  readonly type?: unknown;
  readonly title?: unknown;
  readonly author?: readonly CslName[];
  readonly editor?: readonly CslName[];
  readonly issued?: {
    readonly "date-parts"?: readonly (readonly (number | string)[])[];
    readonly literal?: unknown;
    readonly raw?: unknown;
  };
  readonly "container-title"?: unknown;
  readonly volume?: unknown;
  readonly issue?: unknown;
  readonly page?: unknown;
  readonly publisher?: unknown;
  readonly "publisher-place"?: unknown;
  readonly edition?: unknown;
  readonly ISSN?: unknown;
  readonly ISBN?: unknown;
  readonly DOI?: unknown;
  readonly URL?: unknown;
  readonly abstract?: unknown;
  readonly keyword?: unknown;
  readonly note?: unknown;
};
