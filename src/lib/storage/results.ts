import { type ModuleId, type ModuleResult, type Place } from "@/lib/domain";

import { MANUAL_KEY, MARKS_KEY, bodyKey } from "./records";
import { commit } from "./writer";

/**
 * What the modules answered, and what the person did with it.
 *
 * A body is written once, under the address it came from. It is fetched again
 * rather than reconstructed when it is missing - the address gives back the
 * same bytes - so this store is the difference between a reload that carries
 * on and a reload that waits for tens of megabytes again.
 *
 * There is no ceiling on how many findings are kept. A truncated result is a
 * check the person paid for and did not get, and the quota is answered by
 * saying so on screen rather than by quietly keeping less.
 */

export type StoredBody = {
  readonly docId: string;
  readonly module: ModuleId;
  /** The address it was fetched from, so a retry's body is not taken for it. */
  readonly ref: string;
  readonly body: ModuleResult;
};

export function writeBody(entry: StoredBody): Promise<void> {
  return commit((stores) => {
    stores.results.put({ key: bodyKey(entry.docId, entry.module), ...entry });
  });
}

/**
 * The marks a person puts on findings while reading: dealt with, turned down,
 * and the sources accepted for a claim. None of them travels to the server, and
 * all of them are why a reload does not send somebody back through a list they
 * have already been through.
 */
export type StoredMarks = {
  readonly fixed: Readonly<Record<string, true>>;
  readonly ignored: Readonly<Record<string, true>>;
  readonly accepted: Readonly<Record<string, true>>;
};

export function writeMarks(marks: StoredMarks): Promise<void> {
  return commit((stores) => {
    stores.results.put({ key: MARKS_KEY, ...marks });
  }, MARKS_KEY);
}

/**
 * The places pointed at by hand, where nothing else could find one. They are
 * written with the text rather than beside it: an edit moves them, and a reload
 * that found them under one revision of the document and the text under another
 * would put somebody's highlight in the wrong paragraph.
 */
export function writeManualPlaces(
  places: ReadonlyArray<readonly [string, Place]>,
): Promise<void> {
  return commit((stores) => {
    if (places.length === 0) stores.results.delete(MANUAL_KEY);
    else stores.results.put({ key: MANUAL_KEY, places });
  }, MANUAL_KEY);
}
