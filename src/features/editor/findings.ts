"use client";

import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
} from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

import { type Severity } from "@/lib/domain";

/**
 * The findings, drawn over the text.
 *
 * A layer and nothing more: the document is not changed by a character, which
 * is the promise the product makes about a manuscript and the reason a
 * highlight can be put on a text somebody is in the middle of typing into. What
 * is marked is the line, so that a finding is visible while scrolling past it,
 * and the exact fragment inside the line, so that it is clear which words were
 * judged.
 *
 * The set moves with the text on its own, which is the whole reason the editor
 * is a real editor: an insertion above a finding shifts it by exactly the
 * length of the insertion, and nothing recomputes anything. An edit that
 * crosses a highlight is different - the module judged characters that are no
 * longer there - so that highlight is taken off at once rather than left
 * standing over replaced text. The card stays where it is, gains the note that
 * its fragment has changed, and keeps its way back to the place.
 */
export type EditorFinding = {
  /** Document, module, finding and which of its places: unique on the screen. */
  readonly key: string;
  readonly from: number;
  readonly to: number;
  readonly severity: Severity;
  /** Marked as dealt with or turned down: still shown, and shown quietly. */
  readonly settled: boolean;
};

/** Replaces every highlight: a new answer, or a pass over an edited text. */
export const setFindings = StateEffect.define<readonly EditorFinding[]>();

/** Which one is being read. Exactly one, or none. */
export const setActiveFinding = StateEffect.define<string | null>();

const findingMark = (finding: EditorFinding, active: boolean) =>
  Decoration.mark({
    class: [
      "cm-finding",
      `cm-finding-${finding.severity}`,
      finding.settled ? "cm-finding-settled" : "",
      active ? "cm-finding-active" : "",
    ]
      .filter(Boolean)
      .join(" "),
    attributes: { "data-finding": finding.key },
    // The two ends are not part of it: typing at the very edge of a fragment
    // extends the sentence around it rather than the fragment being judged.
    inclusive: false,
  });

const findingLine = (finding: EditorFinding, active: boolean) =>
  Decoration.line({
    class: [
      "cm-finding-line",
      `cm-finding-line-${finding.severity}`,
      active ? "cm-finding-line-active" : "",
    ].join(" "),
  });

function build(
  state: EditorState,
  findings: readonly EditorFinding[],
  active: string | null,
): DecorationSet {
  const ranges = [];
  for (const finding of findings) {
    const from = Math.max(0, Math.min(finding.from, state.doc.length));
    const to = Math.max(from, Math.min(finding.to, state.doc.length));
    const isActive = finding.key === active;

    // The line first: a line decoration and a mark starting at the same
    // position have to arrive in that order, and a set that is not sorted this
    // way is rejected by the editor rather than drawn wrongly.
    const firstLine = state.doc.lineAt(from).number;
    const lastLine = state.doc.lineAt(to).number;
    for (let number = firstLine; number <= lastLine; number += 1) {
      const line = state.doc.line(number);
      ranges.push(findingLine(finding, isActive).range(line.from));
    }
    if (to > from) ranges.push(findingMark(finding, isActive).range(from, to));
  }
  return Decoration.set(ranges, true);
}

type Marked = {
  readonly findings: readonly EditorFinding[];
  readonly active: string | null;
  readonly decorations: DecorationSet;
};

const marked = StateField.define<Marked>({
  create: () => ({ findings: [], active: null, decorations: Decoration.none }),
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setFindings)) {
        return {
          findings: effect.value,
          active: value.active,
          decorations: build(transaction.state, effect.value, value.active),
        };
      }
      if (effect.is(setActiveFinding)) {
        return {
          findings: value.findings,
          active: effect.value,
          decorations: build(transaction.state, value.findings, effect.value),
        };
      }
    }

    if (!transaction.docChanged) return value;

    /*
     * The edit moves everything below it and takes off whatever it crossed. The
     * remaining highlights are carried by the editor's own mapping rather than
     * by arithmetic here, which is what makes a paragraph pasted in above a
     * hundred findings free instead of a hundred recomputations.
     */
    const kept = value.findings.filter(
      (finding) => !transaction.changes.touchesRange(finding.from, finding.to),
    );
    return {
      findings: kept.map((finding) => ({
        ...finding,
        from: transaction.changes.mapPos(finding.from, 1),
        to: transaction.changes.mapPos(finding.to, -1),
      })),
      active: value.active,
      decorations: value.decorations.map(transaction.changes),
    };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/** What is highlighted right now, in the order it occurs in the document. */
export function findingsIn(state: EditorState): readonly EditorFinding[] {
  return state.field(marked, false)?.findings ?? [];
}

export function activeFindingIn(state: EditorState): string | null {
  return state.field(marked, false)?.active ?? null;
}

/**
 * A press on a highlight goes to the finding, which is the other half of the
 * pair with the list: reading the text and reading the list are the same work
 * seen from two sides, and the fragment says so under the pointer before it is
 * tried. On the fragment whose card is already open the caret is what a press
 * gives instead - there is nowhere to go from there, and the next thing to do
 * in an open finding is to correct the text.
 */
function pressed(onOpen: (key: string) => void): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      const target = event.target;
      if (!(target instanceof Element)) return false;
      const highlight = target.closest("[data-finding]");
      const key = highlight?.getAttribute("data-finding");
      if (key === null || key === undefined) return false;
      if (key === activeFindingIn(view.state)) return false;
      onOpen(key);
      return false;
    },
  });
}

/**
 * How a highlight is drawn. Colour and weight only, and no geometry: a
 * background that appeared under a fragment on hover would move the text the
 * person is reading, and the same rule holds here as everywhere else in the
 * product.
 */
const findingTheme = EditorView.theme({
  ".cm-finding": {
    borderRadius: "2px",
    padding: "1px 0",
    cursor: "pointer",
    transition: "background-color var(--motion-fast) var(--ease-out)",
  },
  ".cm-finding-critical": {
    backgroundColor: "var(--critical-soft)",
    boxShadow: "inset 0 -2px 0 0 var(--critical)",
  },
  ".cm-finding-warning": {
    backgroundColor: "var(--warning-soft)",
    boxShadow: "inset 0 -2px 0 0 var(--warning)",
  },
  ".cm-finding-info": {
    backgroundColor: "var(--muted)",
    boxShadow: "inset 0 -2px 0 0 var(--muted-foreground)",
  },
  ".cm-finding:hover": {
    backgroundColor: "color-mix(in srgb, var(--accent-bg) 70%, var(--card))",
  },
  /*
   * The one being read is the one thing on the page that has to be found
   * without looking for it, so it is the only fragment given a ring; and the
   * pointer over it goes back to being a text cursor, because standing in the
   * place one came for, the next press should put the caret in it.
   */
  ".cm-finding-active": {
    outline: "2px solid var(--primary)",
    outlineOffset: "1px",
    cursor: "text",
  },
  /* Dealt with or turned down: still marked, and no longer competing. */
  ".cm-finding-settled": { opacity: "0.55", boxShadow: "none" },
  ".cm-finding-line": {
    backgroundColor: "color-mix(in srgb, var(--muted) 55%, transparent)",
  },
  ".cm-finding-line-critical": {
    backgroundColor: "color-mix(in srgb, var(--critical-soft) 55%, transparent)",
  },
  ".cm-finding-line-warning": {
    backgroundColor: "color-mix(in srgb, var(--warning-soft) 55%, transparent)",
  },
  ".cm-finding-line-active": {
    backgroundColor: "color-mix(in srgb, var(--accent-bg) 85%, transparent)",
  },
});

/** The whole layer, as one extension the editor is handed. */
export function findingHighlights(onOpen: (key: string) => void): readonly Extension[] {
  return [marked, pressed(onOpen), findingTheme];
}
