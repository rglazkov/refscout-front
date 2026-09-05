import { isResolved, type Place } from "@/lib/domain";

import { docRegistry } from "./registry";
import { pageOf } from "./spans";

/**
 * A finding's places, said in words: a page, an entry of a bibliography, the
 * sentence the module quoted, and whether any of them can be jumped to. This is
 * what a row of a list says about where something is without the text being on
 * screen at all - and it is enough to go and correct the manuscript, which is
 * what the person is about to do.
 *
 * The numbers are ours. A page comes from the map built when the document was
 * read, out of a place that has been resolved against the live text, so it
 * follows the text through every edit; none of it travels over the wire in
 * either direction.
 */
export type PlaceSummary = {
  /** How many places the finding has: a work cited twice has two. */
  readonly count: number;
  /** How many of them can be jumped to. */
  readonly resolved: number;
  /** How many had an address that would not resolve: the failures. */
  readonly lost: number;
  /** The text under at least one of them has been edited since the check ran. */
  readonly edited: boolean;
  /** In the order they were given, without repeats: "p. 4, 9". */
  readonly pages: readonly number[];
  readonly bibkeys: readonly string[];
  /** The first quote among the places, for the panel under the row. */
  readonly quote?: string;
};

export function placesOf(places: readonly Place[]): PlaceSummary {
  const pages: number[] = [];
  const bibkeys: string[] = [];
  let quote: string | undefined;
  let resolved = 0;
  let lost = 0;
  let edited = false;

  for (const place of places) {
    quote ??= place.quote;
    if (place.bibkey !== undefined && !bibkeys.includes(place.bibkey)) {
      bibkeys.push(place.bibkey);
    }
    if (place.status === "lost") lost += 1;
    if (place.edited === true) edited = true;
    if (!isResolved(place)) continue;
    resolved += 1;
    if (place.anchor === undefined) continue;
    const page = pageOf(docRegistry.get(place.docId)?.pages, place.anchor);
    if (page !== null && !pages.includes(page)) pages.push(page);
  }

  return {
    count: places.length,
    resolved,
    lost,
    edited,
    pages,
    bibkeys,
    ...(quote === undefined ? {} : { quote }),
  };
}
