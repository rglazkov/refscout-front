import { plugins } from "@citation-js/core";
import "@citation-js/plugin-bibtex";

import { type BibSpan, type LocalFinding } from "@/lib/domain";

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
    spans.push({ key, from, to });
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
