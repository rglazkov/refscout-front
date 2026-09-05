/**
 * What has been typed into a document since it was sent, kept so that a place
 * counted over the text that left can be found in the text that is here now.
 *
 * A check takes a while, and correcting the manuscript while it runs is
 * ordinary work rather than a misuse of the screen. When the answer arrives it
 * is about the text as it was sent: every offset in it is counted from a
 * beginning that has since had a paragraph inserted above it. Recomputing the
 * whole list on every keystroke would be the obvious way to keep up and the
 * wrong one - it is a walk over every place a body carries, per key - so the
 * edits are accumulated instead and applied to a place once, at the moment it
 * is needed.
 *
 * What is kept is a description of the difference and not a copy of anything: a
 * few numbers per stretch of text that was replaced. Runs of typing collapse
 * into one stretch as they are recorded, so a person writing a paragraph leaves
 * one entry behind rather than a hundred.
 */

/**
 * One stretch of the sent text that has been replaced, and how long what
 * replaced it is. `from` and `to` are positions in the text as it was sent;
 * `length` is measured in the text as it stands now.
 */
type Replacement = {
  readonly from: number;
  readonly to: number;
  readonly length: number;
};

/** One edit as the editor reports it, in the coordinates of the text it saw. */
export type TextEdit = {
  readonly from: number;
  readonly to: number;
  readonly length: number;
};

const pending = new Map<string, Replacement[]>();

/**
 * Records what an edit did.
 *
 * The positions are in the document as it was before the edit, which is what an
 * editor reports and what makes several changes in one keystroke - a
 * replacement across a multiple selection - describable at all: they are all
 * measured against the same text. They arrive in the order they occur in the
 * document, which is also the editor's, and that order is what lets them be
 * composed at all.
 */
export function recordEdits(docId: string, edits: readonly TextEdit[]): void {
  if (edits.length === 0) return;
  let regions = pending.get(docId) ?? [];
  /*
   * Applied last first. Every edit of one transaction is measured against the
   * document as it was before any of them, so composing them from the front
   * would leave the later ones describing positions the earlier ones have
   * already moved.
   */
  for (let at = edits.length - 1; at >= 0; at -= 1) {
    const edit = edits[at];
    if (edit === undefined) continue;
    regions = compose(regions, edit);
  }
  pending.set(docId, regions);
}

/**
 * Adds one more replacement to what is already known, merging it with anything
 * it touches. Merging on touch rather than on overlap is what makes typing
 * cheap: each keystroke extends the stretch the one before it created instead
 * of adding a stretch of its own.
 */
function compose(regions: readonly Replacement[], edit: TextEdit): Replacement[] {
  const composed: Replacement[] = [];
  let delta = 0;
  let at = 0;

  // Everything that ends before the edit begins is untouched by it.
  for (; at < regions.length; at += 1) {
    const region = regions[at];
    if (region === undefined) continue;
    const start = region.from + delta;
    if (start + region.length >= edit.from) break;
    composed.push(region);
    delta += region.length - (region.to - region.from);
  }

  let from: number;
  /** How much of the merged stretch's current text is kept before the edit. */
  let head = 0;
  let to: number;
  /** Where in the current text the last merged stretch ends. */
  let end = edit.from;

  const first = regions[at];
  if (first !== undefined && first.from + delta <= edit.from) {
    from = first.from;
    head = edit.from - (first.from + delta);
    to = first.to;
    end = first.from + delta + first.length;
    delta += first.length - (first.to - first.from);
    at += 1;
  } else {
    from = edit.from - delta;
    to = from;
  }

  // And everything the edit reaches, up to and including what merely touches
  // its far end.
  for (; at < regions.length; at += 1) {
    const region = regions[at];
    if (region === undefined) continue;
    const start = region.from + delta;
    if (start > edit.to) break;
    to = region.to;
    end = start + region.length;
    delta += region.length - (region.to - region.from);
  }

  const tail = Math.max(0, end - edit.to);
  composed.push({
    from,
    to: Math.max(to, edit.to - delta, from),
    length: head + edit.length + tail,
  });

  for (; at < regions.length; at += 1) {
    const region = regions[at];
    if (region !== undefined) composed.push(region);
  }
  return composed;
}

/**
 * Where an offset in the sent text sits in the text as it stands.
 *
 * An offset inside a stretch that has been replaced collapses to the start of
 * it: the characters it pointed at are not there any more, and the beginning of
 * what replaced them is the nearest true thing that can be said.
 *
 * `side` decides the one genuinely ambiguous case, which is an offset standing
 * exactly where something was inserted. The two ends of a fragment want
 * opposite answers there, and getting it wrong swallows the insertion into the
 * highlight: a paragraph typed in immediately after a quoted sentence would
 * become part of the sentence the module judged. So a start takes the text that
 * follows the insertion and an end stops before it.
 */
export function projectOffset(docId: string, offset: number, side: 1 | -1 = 1): number {
  const regions = pending.get(docId);
  if (regions === undefined) return offset;
  let delta = 0;
  for (const region of regions) {
    if (offset < region.from) break;
    if (offset === region.from && side < 0) break;
    if (offset < region.to) return region.from + delta;
    delta += region.length - (region.to - region.from);
  }
  return offset + delta;
}

/**
 * Whether anything was typed inside a stretch of the sent text. This is what
 * decides that a finding is about characters that are no longer there: an
 * insertion strictly inside it counts, one at either edge does not.
 */
export function editedWithin(docId: string, from: number, to: number): boolean {
  const regions = pending.get(docId);
  if (regions === undefined) return false;
  return regions.some((region) =>
    region.from === region.to
      ? region.from > from && region.from < to
      : region.from < to && region.to > from,
  );
}

/**
 * Where an offset ends up after one batch of edits. It is the same arithmetic
 * as the projection above, applied to a single transaction rather than to
 * everything accumulated: what needs it is a place the person pointed at
 * themselves, which was recorded in the text as it stands and so has nothing to
 * catch up on but what happens next.
 */
export function movedBy(
  offset: number,
  edits: readonly TextEdit[],
  side: 1 | -1 = 1,
): number {
  let delta = 0;
  for (const edit of edits) {
    if (offset < edit.from) break;
    if (offset === edit.from && side < 0) break;
    if (offset < edit.to) return edit.from + delta;
    delta += edit.length - (edit.to - edit.from);
  }
  return offset + delta;
}

/** Whether this document has been touched at all since it was sent. */
export function hasEdits(docId: string): boolean {
  return (pending.get(docId)?.length ?? 0) > 0;
}

/**
 * Starts counting again. It is called as a document is sent, so that what is
 * accumulated is always "since this text left" and never a mixture of two runs.
 */
export function forgetEdits(docId: string): void {
  pending.delete(docId);
}

export function clearEdits(): void {
  pending.clear();
}
