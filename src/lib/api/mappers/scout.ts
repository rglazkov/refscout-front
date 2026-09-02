import { type ScoutAnswer, type ScoutRecord } from "@/lib/domain";
import { type ScoutResponse as WireScoutResponse } from "@/lib/api/wire";

import { toBiblioRecord } from "./issue";

/**
 * The seam for a search. The record itself is mapped by the same function that
 * maps a Cite candidate, because it is the same record: one definition, and one
 * card drawing it on both screens.
 *
 * `degraded` becomes an array rather than staying optional. An answer where no
 * database failed and an answer that did not mention the question are the same
 * thing to the screen - a list with nothing to say beside it - and an optional
 * field would make every reader ask that question again.
 */
export function toScoutAnswer(w: WireScoutResponse): ScoutAnswer {
  return {
    results: w.results.map(toScoutRecord),
    searchedSources: w.searchedSources,
    degraded: w.degraded ?? [],
  };
}

function toScoutRecord(w: WireScoutResponse["results"][number]): ScoutRecord {
  return {
    ...toBiblioRecord(w),
    resultId: w.resultId,
    ...(w.relevance === undefined ? {} : { relevance: w.relevance }),
  };
}
