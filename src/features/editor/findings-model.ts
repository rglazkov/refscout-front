import { placeKey, type PlacedFinding } from "@/lib/anchor";
import {
  type Evidence,
  type Issue,
  type ModuleId,
  type ModuleResult,
  type Params,
  type Place,
  type Severity,
} from "@/lib/domain";

/**
 * The findings of one document, ready to be listed beside its text.
 *
 * Two things are joined here and they come from different places. The words -
 * what is wrong, how badly, what the module offers to do about it - are in the
 * answer. Where it is in the text is a place the resolver worked out, and it
 * moves as the person types. Neither knows about the other, and this is the one
 * function that puts them together, so that the list beside the text and the
 * list inside a card are two drawings of the same thing rather than two
 * readings of it.
 */
export type FindingPlace = {
  /** Unique on the screen: document, module, finding and which of its places. */
  readonly key: string;
  readonly ordinal: number;
  readonly place: Place;
};

export type PanelFinding = {
  /** Document, module and finding: what a mark is kept under. */
  readonly issueKey: string;
  readonly docId: string;
  readonly module: ModuleId;
  readonly issueId: string;
  readonly severity: Severity;
  readonly titleKey: string;
  readonly code: string;
  readonly params?: Params;
  readonly detail?: string;
  /**
   * The typed facts the module answered with - a DOI, an address, a date, a
   * count, a named source. They travel with the finding because the card under
   * the line is where a finding is read, and a finding read without them is a
   * title and a line number.
   */
  readonly evidence: readonly Evidence[];
  /** Its places inside the document being read, in the order they occur in it. */
  readonly places: readonly FindingPlace[];
  /** What the module offers to put in the text, and at which of its places. */
  readonly replacement?: { readonly value: string; readonly at: number };
  readonly copy?: string;
};

function issueOf(result: ModuleResult, issueId: string): Issue | undefined {
  return result.issues.find((issue) => issue.issueId === issueId);
}

/**
 * The findings of a document, one entry per place rather than one per finding.
 *
 * This is what the list beside the text is built from, and it is built this way
 * so that the list and the text say the same thing. A work cited three times is
 * highlighted three times, and a list that named it once left the reader
 * counting three marks against one row and concluding that the two disagreed -
 * which is the one thing a list beside a text must never do. Each row still
 * says which of the places it is ("2 of 3"), so the repetition explains itself
 * rather than looking like the same finding listed twice.
 */
export type PanelRow = { readonly finding: PanelFinding; readonly at: number };

export function panelRows(findings: readonly PanelFinding[]): readonly PanelRow[] {
  return findings.flatMap((finding) =>
    finding.places.map((_place, at) => ({ finding, at })),
  );
}

/**
 * The findings themselves, one to a finding, each carrying its places. It is
 * what the card is drawn from and what the rows above are flattened out of: a
 * finding is one thing that is wrong, however many places in the text it
 * touches.
 */
export function panelFindings(
  placed: readonly PlacedFinding[],
  results: Readonly<Record<string, ModuleResult>>,
): readonly PanelFinding[] {
  const byIssue = new Map<string, PanelFinding>();
  const order: string[] = [];

  for (const entry of placed) {
    const result = results[`${entry.docId}:${entry.module}`];
    const issue = result === undefined ? undefined : issueOf(result, entry.issueId);
    if (issue === undefined) continue;

    const issueKey = `${entry.docId}:${entry.module}:${entry.issueId}`;
    const place: FindingPlace = {
      key: placeKey(entry.docId, entry.module, entry.issueId, entry.ordinal),
      ordinal: entry.ordinal,
      place: entry.place,
    };

    const standing = byIssue.get(issueKey);
    if (standing !== undefined) {
      byIssue.set(issueKey, { ...standing, places: [...standing.places, place] });
      continue;
    }

    const replace = issue.actions.find((action) => action.kind === "replace");
    const copy = issue.actions.find((action) => action.kind === "copy");
    order.push(issueKey);
    byIssue.set(issueKey, {
      issueKey,
      docId: entry.docId,
      module: entry.module,
      issueId: entry.issueId,
      severity: issue.severity,
      titleKey: issue.titleKey,
      code: issue.code,
      ...(issue.params === undefined ? {} : { params: issue.params }),
      ...(issue.detail === undefined ? {} : { detail: issue.detail }),
      evidence: issue.evidence,
      places: [place],
      ...(replace === undefined
        ? {}
        : { replacement: { value: replace.value, at: replace.anchorIndex } }),
      ...(copy === undefined ? {} : { copy: copy.value }),
    });
  }

  return order.flatMap((key) => {
    const finding = byIssue.get(key);
    return finding === undefined ? [] : [finding];
  });
}

/**
 * Which finding is being read, and at which of its places.
 *
 * One value rather than two, because a finding with three places is one thing
 * the person is looking at and the place is which of its three they are
 * standing on: keeping them apart lets a press on a row leave the ordinal of
 * the previous finding behind and open the fourth place of a finding that has
 * one.
 */
export type PanelSelection = {
  readonly issueKey: string;
  /** Which of this finding's places in this document is the current one. */
  readonly at: number;
};
