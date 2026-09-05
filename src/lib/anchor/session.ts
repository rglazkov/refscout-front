import { docRegistry, editedWithin, movedBy, type TextEdit } from "@/lib/docs";
import {
  type BibSpan,
  type ModuleId,
  type ModuleResult,
  type Place,
  asDocOffset,
  resultKey,
} from "@/lib/domain";
import { anchoringOf } from "@/lib/normalize";
import { track } from "@/lib/telemetry";
import { resolvePlaces } from "@/workers";

import { projectAnchor } from "./project";
import { type ProjectedAnchor, type ResolveCounts, type ResolveIssue } from "./resolve";

/**
 * Where the places of every answer are kept, and what makes them keep up with
 * the text.
 *
 * It lives outside React for the same reason the texts do. A pass is started by
 * an answer arriving and by the text settling after being edited - two discrete
 * events, neither of them a render - and what it produces is read by the cards,
 * by the editor and by the report, which have no common component to hang it
 * on. Screens subscribe to it; nothing here knows that they exist.
 *
 * Nothing of a person's text is kept here that is not already in the registry:
 * a place is a status and at most two numbers, plus the fragment the module
 * itself quoted.
 */

type ResolvedBody = {
  readonly docId: string;
  readonly module: ModuleId;
  readonly attempt: number;
  /** The answer itself, so that a pass can be run again over an edited text. */
  readonly result: ModuleResult;
  readonly places: Readonly<Record<string, readonly Place[]>>;
  readonly counts: ResolveCounts;
  /** Whether a pass is in flight, so that edits do not start a second one. */
  readonly running: boolean;
};

const bodies = new Map<string, ResolvedBody>();
const listeners = new Set<() => void>();

/**
 * One value that changes whenever anything here does. Components read places
 * through it, so a render is asked for once per pass rather than once per
 * finding, and a card that has not changed compares equal and does not redraw.
 */
let version = 0;

function changed(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeToPlaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function placesVersion(): number {
  return version;
}

/** Every place of one finding, in the order the module listed them. */
export function placesOfIssue(
  docId: string,
  module: ModuleId,
  issueId: string,
): readonly Place[] {
  const resolved = bodies.get(resultKey(docId, module))?.places[issueId] ?? EMPTY;
  if (manual.size === 0) return resolved;
  return resolved.map(
    (place, ordinal) => manual.get(placeKey(docId, module, issueId, ordinal)) ?? place,
  );
}

const EMPTY: readonly Place[] = [];

/**
 * What the person pointed at themselves, when nothing else could find a place.
 *
 * It stands over the automatic answer rather than replacing it: the finding is
 * still one the resolver could not place, the share of such findings is still
 * what it was, and none of this reaches the server. Hiding the failure by
 * counting a hand-placed highlight as a success would take away the one number
 * that says the contract and the resolver have drifted apart.
 */
const manual = new Map<string, Place>();

export function placeKey(
  docId: string,
  module: ModuleId,
  issueId: string,
  ordinal: number,
): string {
  return `${docId}:${module}:${issueId}:${ordinal}`;
}

export function setManualPlace(key: string, place: Place): void {
  manual.set(key, { ...place, status: "manual" });
  changed();
}

export function clearManualPlace(key: string): void {
  manual.delete(key);
  changed();
}

/**
 * Carries the hand-placed highlights across an edit. They were recorded in the
 * text as it stands, so they have nothing to catch up on except what happens
 * from here - which is exactly one batch of changes at a time, as it happens.
 */
export function moveManualPlaces(docId: string, edits: readonly TextEdit[]): void {
  if (manual.size === 0 || edits.length === 0) return;
  for (const [key, place] of manual) {
    if (place.docId !== docId || place.range === undefined) continue;
    const from = movedBy(place.range.from, edits);
    const to = movedBy(place.range.to, edits, -1);
    manual.set(key, {
      ...place,
      anchor: asDocOffset(from),
      range: { from: asDocOffset(from), to: asDocOffset(to) },
    });
  }
  changed();
}

/** How one module's answer landed, for the sentence a card shows about itself. */
export function anchoringCounts(
  docId: string,
  module: ModuleId,
): ResolveCounts | undefined {
  return bodies.get(resultKey(docId, module))?.counts;
}

/**
 * Every finding that has a place in one document, whichever module reported it
 * and whichever document that module was checking. This is what the editor
 * draws: a manuscript's own findings and, in a bibliography, the entries a
 * check on the manuscript pointed at.
 */
export type PlacedFinding = {
  readonly docId: string;
  readonly module: ModuleId;
  readonly issueId: string;
  readonly ordinal: number;
  readonly place: Place;
};

export function placesInDocument(docId: string): readonly PlacedFinding[] {
  const placed: PlacedFinding[] = [];
  for (const body of bodies.values()) {
    for (const [issueId, places] of Object.entries(body.places)) {
      places.forEach((standing, ordinal) => {
        const place =
          manual.get(placeKey(body.docId, body.module, issueId, ordinal)) ?? standing;
        if (place.docId !== docId || place.range === undefined) return;
        placed.push({
          docId: body.docId,
          module: body.module,
          issueId,
          ordinal,
          place,
        });
      });
    }
  }
  return placed.sort(
    (left, right) => (left.place.range?.from ?? 0) - (right.place.range?.from ?? 0),
  );
}

/** Everything known about placement is dropped along with the run it belonged to. */
export function forgetPlaces(): void {
  bodies.clear();
  manual.clear();
  changed();
}

/**
 * Starts a pass over one module's answer.
 *
 * A body whose coordinates were not counted over our text is not resolved at
 * all: its findings are shown without places, and the card says so. Running the
 * search over them anyway would turn a known disagreement into a scattering of
 * plausible highlights, which is the one outcome worse than none.
 */
export function resolveBody(result: ModuleResult): void {
  const key = resultKey(result.docId, result.module);
  if (!anchoringOf(result).anchored) {
    bodies.delete(key);
    changed();
    return;
  }
  void run(key, result);
}

/**
 * Runs the pass again over one document, after what was typed into it stopped
 * changing. Every answer that points into this document takes part, including
 * one about a different document: a finding on a manuscript addresses entries
 * of the bibliography beside it, and correcting the bibliography moves them.
 */
export function reresolveDocument(docId: string): void {
  for (const [key, body] of bodies) {
    const touches =
      body.docId === docId ||
      Object.values(body.places).some((places) =>
        places.some((place) => place.docId === docId),
      );
    if (touches && !body.running) void run(key, body.result);
  }
}

async function run(key: string, result: ModuleResult): Promise<void> {
  const previous = bodies.get(key);
  bodies.set(key, {
    docId: result.docId,
    module: result.module,
    attempt: result.attempt,
    result,
    places: previous?.places ?? {},
    counts: previous?.counts ?? NOTHING_YET,
    running: true,
  });

  const projected = new Map<string, readonly ProjectedAnchor[]>();
  const issues: ResolveIssue[] = [];
  for (const issue of result.issues) {
    const anchors = issue.anchors.map((anchor) => projectAnchor(anchor, result.docId));
    projected.set(issue.issueId, anchors);
    issues.push({ issueId: issue.issueId, anchors });
  }

  const texts: Record<string, string> = {};
  const bibEntries: Record<string, readonly BibSpan[]> = {};
  for (const anchors of projected.values()) {
    for (const anchor of anchors) {
      if (anchor.docId in texts) continue;
      const content = docRegistry.get(anchor.docId);
      if (content === undefined) continue;
      texts[anchor.docId] = content.text;
      if (content.bibEntries !== undefined) bibEntries[anchor.docId] = content.bibEntries;
    }
  }

  try {
    const resolved = await resolvePlaces({ texts, bibEntries, issues });
    const places: Record<string, readonly Place[]> = {};
    for (const [issueId, list] of Object.entries(resolved.places)) {
      places[issueId] = list.map((place, ordinal) =>
        keepEditedPlace(
          place,
          projected.get(issueId)?.[ordinal],
          previous?.places[issueId]?.[ordinal],
        ),
      );
    }
    bodies.set(key, {
      docId: result.docId,
      module: result.module,
      attempt: result.attempt,
      result,
      places,
      counts: resolved.counts,
      running: false,
    });
    report(result.module, resolved.counts);
  } catch {
    /*
     * A pass that fell over leaves the findings where they were: without
     * places, which is the state the screen already draws and says out loud.
     * The worker's own failure has been reported by the client that runs it.
     */
    const standing = bodies.get(key);
    if (standing !== undefined) bodies.set(key, { ...standing, running: false });
  }
  changed();
}

const NOTHING_YET: ResolveCounts = {
  exact: 0,
  relocated: 0,
  derived: 0,
  none: 0,
  lost: 0,
  folded: 0,
  overBudget: 0,
};

/**
 * The one place a failure to find a fragment is not the end of it: the person
 * edited the fragment themselves.
 *
 * The module judged characters that are no longer there, so the highlight has
 * to go - keeping it would be a claim about text that has been replaced. What
 * does not have to go is the way back to the place: the position survives every
 * edit, including one that deleted the paragraph around it, and a finding that
 * cannot be jumped to because it was acted on is a finding taken away from the
 * person who acted on it.
 *
 * The status is the one the place had before the edit, because it says how the
 * address was arrived at and that has not changed. What has changed is whether
 * the text under it is still the text the module read, and that is what
 * `edited` says.
 */
function keepEditedPlace(
  place: Place,
  anchor: ProjectedAnchor | undefined,
  previous: Place | undefined,
): Place {
  if (place.status !== "lost" || anchor === undefined) return place;
  if (anchor.kind !== "range" && anchor.kind !== "point") return place;
  if (anchor.failure !== undefined) return place;

  const from = anchor.kind === "range" ? anchor.from : anchor.at;
  const to = anchor.kind === "range" ? anchor.to : anchor.at;
  if (!editedWithin(place.docId, from, to)) return place;

  return {
    status: previous?.status ?? "exact",
    docId: place.docId,
    anchor: asDocOffset(Math.min(from, textLengthOf(place.docId))),
    edited: true,
    ...(place.quote === undefined ? {} : { quote: place.quote }),
  };
}

function textLengthOf(docId: string): number {
  return docRegistry.get(docId)?.text.length ?? 0;
}

/**
 * How the answer landed, as numbers. The share found by searching and the share
 * not found at all are what show a divergence from a module the day after it
 * ships rather than a month later through a letter to support, and they are the
 * larger part of why the resolver reports anything at all. Counters only: a
 * fragment of somebody's manuscript in an anchoring event is exactly the leak
 * that is most tempting to add while anchoring is being debugged.
 */
function report(module: ModuleId, counts: ResolveCounts): void {
  const total =
    counts.exact + counts.relocated + counts.derived + counts.none + counts.lost;
  if (total === 0) return;
  if (counts.relocated > 0 || counts.lost > 0 || counts.folded > 0) {
    track("anchor_degraded", {
      code: `ANCHOR_DEGRADED:${module}`,
      context: {
        total,
        relocated: counts.relocated,
        lost: counts.lost,
        folded: counts.folded,
      },
    });
  }
  if (counts.overBudget > 0) {
    track("anchor_budget", {
      code: `ANCHOR_BUDGET:${module}`,
      context: { total, overBudget: counts.overBudget },
    });
  }
}
