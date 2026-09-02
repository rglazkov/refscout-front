import { type Anchor } from "@/lib/domain";

import { docRegistry } from "./registry";
import { bibSpanOf, pageOf } from "./spans";

/**
 * A finding's places, said in words: a page, an entry of a bibliography, the
 * sentence the module quoted. This is what a card can say about where something
 * is before anything is highlighted in the text - and it is enough to go and
 * correct the manuscript, which is what the person is about to do.
 *
 * The numbers are ours. The module sends offsets counted over the text it was
 * given; the page they fall on comes from the page map built when the document
 * was read, and the entry a key names comes from our reading of the
 * bibliography. Nothing here is a number the server sent.
 */
export type PlaceSummary = {
  /** How many places the finding has: a work cited twice has two. */
  readonly count: number;
  /** In the order they were given, without repeats: "p. 4, 9". */
  readonly pages: readonly number[];
  readonly bibkeys: readonly string[];
  /** The first quote among the places, for the panel under the row. */
  readonly quote?: string;
};

/**
 * The places of one finding. `anchored` is the verdict on the body that carried
 * it: when the module worked on a different text than the one we hold, its
 * offsets point into a document that does not exist here, and a page number
 * derived from them would be a confident answer to the wrong question. The
 * finding keeps its words and loses its numbers.
 */
export function placesOf(
  ownDocId: string,
  anchors: readonly Anchor[],
  options: { readonly anchored: boolean },
): PlaceSummary {
  const pages: number[] = [];
  const bibkeys: string[] = [];
  let quote: string | undefined;

  for (const anchor of anchors) {
    const docId = anchor.docId ?? ownDocId;

    if (anchor.kind === "bibkey") {
      if (!bibkeys.includes(anchor.bibkey)) bibkeys.push(anchor.bibkey);
      const entry = options.anchored
        ? bibSpanOf(docRegistry.get(docId)?.bibEntries, anchor.bibkey)
        : null;
      if (entry !== null) addPage(pages, docId, entry.from);
      continue;
    }

    if (anchor.kind === "range" || anchor.kind === "quote") {
      quote ??= anchor.quote === "" ? undefined : anchor.quote;
    }

    if (!options.anchored) continue;
    // A range whose quote is not the length of the range was counted in another
    // unit or cut short, and the offset behind it is not to be believed.
    if (anchor.kind === "range" && anchor.quoteMismatch !== true) {
      addPage(pages, docId, anchor.from);
    } else if (anchor.kind === "point") {
      addPage(pages, docId, anchor.at);
    }
  }

  return {
    count: anchors.length,
    pages,
    bibkeys,
    ...(quote === undefined ? {} : { quote }),
  };
}

function addPage(pages: number[], docId: string, offset: number): void {
  const page = pageOf(docRegistry.get(docId)?.pages, offset);
  if (page !== null && !pages.includes(page)) pages.push(page);
}
