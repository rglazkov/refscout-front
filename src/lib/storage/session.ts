import { type IntakeDraft, type RunIntent } from "@/lib/domain";

import {
  DRAFT_KEY,
  INTENT_KEY,
  JOB_KEY,
  VIEW_KEY,
  editsKey,
  snapshotKey,
} from "./records";
import { commit } from "./writer";

/**
 * What the run knows about itself, written as it changes.
 *
 * None of it is a document, and all of it is what makes a reload continue the
 * work instead of starting it again: the job and the token that reaches it, the
 * intention behind the press of the button, the draft typed into the paste
 * overlay and not yet added, what was sent for each document and what has been
 * typed into it since.
 */

export type StoredJob = { readonly jobId: string; readonly jobToken: string };

export function writeJob(job: StoredJob | null): Promise<void> {
  return commit((stores) => {
    if (job === null) stores.session.delete(JOB_KEY);
    else stores.session.put({ key: JOB_KEY, ...job });
  }, JOB_KEY);
}

export function writeIntent(intent: RunIntent | null): Promise<void> {
  return commit((stores) => {
    if (intent === null) stores.session.delete(INTENT_KEY);
    else stores.session.put({ key: INTENT_KEY, intent });
  }, INTENT_KEY);
}

/**
 * The paste overlay's draft. Closing the overlay does not confirm anything and
 * does not clear it, so a person who closed it to look at something else finds
 * what they were typing when they open it again - including after a reload.
 */
export function writeDraft(draft: IntakeDraft): Promise<void> {
  return commit((stores) => {
    if (draft.text === "" && draft.syntax === "auto") stores.session.delete(DRAFT_KEY);
    else stores.session.put({ key: DRAFT_KEY, text: draft.text, syntax: draft.syntax });
  }, DRAFT_KEY);
}

/** The shape of the working screen: what is folded and which mode is showing. */
export type StoredView = { readonly docListCollapsed: boolean };

export function writeView(view: StoredView): Promise<void> {
  return commit((stores) => {
    stores.session.put({ key: VIEW_KEY, ...view });
  }, VIEW_KEY);
}

/**
 * What was sent for one document, as the two numbers and the index that prove a
 * body's offsets were counted over our text. There is no copy of the text here
 * - a copy would be a second instance of somebody's unpublished manuscript,
 * kept for a comparison a hash settles.
 */
export type StoredSnapshot = {
  readonly textSha256: string;
  readonly cpLength: number;
  /** Written as ordinary numbers: a typed array does not survive every browser's structured clone of an old record. */
  readonly astral: readonly number[] | null;
};

export function writeSnapshot(
  docId: string,
  snapshot: StoredSnapshot | null,
): Promise<void> {
  return commit((stores) => {
    if (snapshot === null) stores.session.delete(snapshotKey(docId));
    else stores.session.put({ key: snapshotKey(docId), docId, ...snapshot });
  }, snapshotKey(docId));
}

/**
 * What has been typed into one document since it was sent, as the stretches
 * that were replaced. It is a description of a difference and never a copy of
 * anything, and it is what lets an answer about the text that left be shown
 * against the text that is here now.
 */
export type StoredRegions = readonly {
  readonly from: number;
  readonly to: number;
  readonly length: number;
}[];

export function writeEdits(docId: string, regions: StoredRegions): Promise<void> {
  return commit((stores) => {
    if (regions.length === 0) stores.session.delete(editsKey(docId));
    else stores.session.put({ key: editsKey(docId), docId, regions });
  }, editsKey(docId));
}
