import { type BiblioRecord } from "./issue";

/**
 * The bibliographic databases a search reaches. They are named here because the
 * badge on a record is drawn from this list and its words come from the
 * dictionary: an identifier the server invents that is not in this list is not
 * a badge we can name, so it is shown as it arrived rather than dropped.
 */
export const sourceIds = [
  "crossref",
  "openalex",
  "semanticscholar",
  "pubmed",
  "arxiv",
  "doaj",
  "core",
  "datacite",
  "unpaywall",
  "europepmc",
] as const;

export type SourceId = (typeof sourceIds)[number];

/**
 * How many records one search asks for. It is the request's one option: the
 * order of the list and every filter over it are the browser's work, so nothing
 * else about a search ever leaves the tab.
 */
export const searchLimits = [10, 25, 50, 100] as const;

export type SearchLimit = (typeof searchLimits)[number];

/**
 * A work a search found. The record itself is the shape Cite's candidates
 * arrive in, so one record has one definition and one card on both screens;
 * what a search adds is an identifier the thumb can name and the relevance the
 * databases scored it with.
 */
export type ScoutRecord = BiblioRecord & {
  readonly resultId: string;
  readonly relevance?: number;
};

/**
 * The answer to one search. `degraded` is what keeps a partial answer honest:
 * two databases that timed out are not an empty result and not a failure, so
 * the list is shown and the interface says beside it that it is incomplete.
 */
export type ScoutAnswer = {
  readonly results: readonly ScoutRecord[];
  readonly searchedSources: readonly string[];
  readonly degraded: readonly string[];
};

export type ScoutVote = "up" | "down";
