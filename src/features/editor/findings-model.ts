import { placeKey, type PlacedFinding } from "@/lib/anchor";
import {
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
 * One row per finding rather than one per place. A work cited twice is one
 * problem in two places, and a list that said so twice would have the person
 * reading the same sentence again to find out it is the same sentence; the row
 * carries a counter instead, and stepping through the places is done from
 * inside it.
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
