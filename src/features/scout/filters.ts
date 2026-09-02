import { type ScoutRecord } from "@/lib/domain";

/**
 * The order and the narrowing of a list of results, computed here rather than
 * asked of the server.
 *
 * The server answers with a list; everything after that is work over an answer
 * the person already has. Going back for a different order would mean waiting
 * on the network to sort what is on the screen, so the request has one option -
 * how many records - and this module has the rest.
 *
 * It is a pure function of the answer and the form, which is what makes "no
 * request is made when a filter changes" a thing a test can hold rather than a
 * habit.
 */
export const sortOrders = ["relevance", "year", "citations"] as const;

export type SortOrder = (typeof sortOrders)[number];

export type Filters = {
  /** Empty means "not filtered by this", for every field here. */
  readonly yearFrom: string;
  readonly yearTo: string;
  readonly minCitations: string;
  readonly author: string;
  readonly venue: string;
  readonly openAccessOnly: boolean;
  readonly withDoiOnly: boolean;
};

export const noFilters: Filters = {
  yearFrom: "",
  yearTo: "",
  minCitations: "",
  author: "",
  venue: "",
  openAccessOnly: false,
  withDoiOnly: false,
};

export function isFiltered(filters: Filters): boolean {
  return (
    filters.yearFrom !== "" ||
    filters.yearTo !== "" ||
    filters.minCitations !== "" ||
    filters.author !== "" ||
    filters.venue !== "" ||
    filters.openAccessOnly ||
    filters.withDoiOnly
  );
}

export function arrange(
  results: readonly ScoutRecord[],
  filters: Filters,
  order: SortOrder,
): readonly ScoutRecord[] {
  return [...results.filter((record) => keeps(record, filters))].sort(by(order));
}

function keeps(record: ScoutRecord, filters: Filters): boolean {
  const from = numberOf(filters.yearFrom);
  const to = numberOf(filters.yearTo);
  const citations = numberOf(filters.minCitations);

  // A record with no year is kept unless a year is being asked for: the field
  // is missing rather than out of range, and dropping it silently would hide a
  // real paper because a database was terse.
  if (from !== undefined && (record.year ?? -Infinity) < from) return false;
  if (to !== undefined && (record.year ?? Infinity) > to) return false;
  if (citations !== undefined && (record.citedBy ?? 0) < citations) return false;
  if (filters.openAccessOnly && !record.openAccess) return false;
  // The claim is that the search resolved the DOI, not that the record carries
  // one: a string in a field is not a check anybody ran.
  if (filters.withDoiOnly && record.doiVerified !== true) return false;
  if (filters.author !== "" && !contains(record.authors.join("; "), filters.author)) {
    return false;
  }
  if (filters.venue !== "" && !contains(record.venue ?? "", filters.venue)) return false;
  return true;
}

/**
 * Case-insensitive containment, folded the way the browser folds it. The names
 * being matched are in every alphabet the databases hold, so `toLowerCase` on
 * its own is not the question being asked.
 */
function contains(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase());
}

function numberOf(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * The years the answer actually holds, newest first. The two year fields print
 * the ends of it as their hint, so the range there is anything to narrow inside
 * is on screen before a key is pressed.
 */
export function yearsIn(results: readonly ScoutRecord[]): readonly number[] {
  const years = new Set<number>();
  for (const record of results) {
    if (record.year !== undefined) years.add(record.year);
  }
  return [...years].sort((a, b) => b - a);
}

function by(order: SortOrder): (a: ScoutRecord, b: ScoutRecord) => number {
  switch (order) {
    case "year":
      return (a, b) => (b.year ?? 0) - (a.year ?? 0);
    case "citations":
      return (a, b) => (b.citedBy ?? 0) - (a.citedBy ?? 0);
    case "relevance":
      return (a, b) => (b.relevance ?? 0) - (a.relevance ?? 0);
  }
}
