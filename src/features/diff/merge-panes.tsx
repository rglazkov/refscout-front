"use client";

import * as React from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Change, MergeView, presentableDiff } from "@codemirror/merge";
import { Compartment, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";

import {
  editorHighlighting,
  editorSurface,
  plainTextPaste,
  tabMovesFocus,
} from "@/features/editor/code-mirror";
import { type DiffChange } from "@/workers";

/**
 * The two panes, side by side, with what changed marked in both.
 *
 * The set of changes is handed in rather than worked out here: comparing two
 * versions of a thesis is one pass over both texts in full, and it has already
 * happened in a worker by the time this is drawn. The merge package is told to
 * use that answer instead of computing its own, which is what the `override`
 * below is - the package's own way of being given a diff.
 *
 * After that, the small re-comparisons that follow a keystroke fall through to
 * the package's algorithm, and they are meant to: an edit re-compares the few
 * hundred characters around itself rather than the two texts, so it is over
 * within a frame and the pane answers the person typing in it.
 *
 * Everything else about a pane is the product's one editor: the same face and
 * gutter, the same selection colour, the same syntax palette, the same fading
 * edges. What a comparison adds is the marks and the alignment.
 */
export type PanesHandle = {
  readonly next: () => void;
  readonly previous: () => void;
};

/** Where the reader is: which change of how many, or none of them. */
export type Position = {
  /** 1-based, or 0 when the caret stands between changes. */
  readonly current: number;
  readonly total: number;
};

/**
 * The marks, in the project's own colours. The package ships a palette of its
 * own, and a red and green picked by somebody else are the two colours on this
 * screen that would not follow the theme.
 *
 * The line the caret is on stays visible over a changed line, which is why the
 * two are named together: on its own the change wins on specificity, and moving
 * through a comparison then leaves no sign of where the caret is.
 */
const marks = EditorView.theme({
  "&.cm-merge-a .cm-changedLine, & .cm-deletedChunk": {
    backgroundColor: "var(--del-soft)",
  },
  "&.cm-merge-b .cm-changedLine": { backgroundColor: "var(--add-soft)" },
  "&.cm-merge-a .cm-changedText, & .cm-deletedChunk .cm-deletedText": {
    background: "color-mix(in srgb, var(--del-soft) 45%, var(--critical-border))",
  },
  "&.cm-merge-b .cm-changedText": {
    background: "color-mix(in srgb, var(--add-soft) 45%, var(--ok-border))",
  },
  "&.cm-merge-a .cm-changedLine.cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--del-soft) 55%, var(--accent-bg))",
  },
  "&.cm-merge-b .cm-changedLine.cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--add-soft) 55%, var(--accent-bg))",
  },
  "&.cm-merge-a .cm-changedLineGutter": { backgroundColor: "var(--critical-border)" },
  "&.cm-merge-b .cm-changedLineGutter": { backgroundColor: "var(--ok-border)" },
  ".cm-mergeSpacer": { backgroundColor: "var(--muted)" },
});

/** How far the text dissolves at an edge that has more text behind it. */
const FADE_PX = 20;

export function MergePanes({
  onReady,
  onPosition,
  left,
  right,
  changes,
  labelLeft,
  labelRight,
  languageLeft,
  languageRight,
  onLeftChange,
  onRightChange,
}: {
  /** Handed the two panes once they exist, and `null` when they are gone. */
  readonly onReady: (panes: PanesHandle | null) => void;
  readonly onPosition: (position: Position) => void;
  readonly left: string;
  readonly right: string;
  readonly changes: readonly DiffChange[];
  readonly labelLeft: string;
  readonly labelRight: string;
  /** What each pane is highlighted as, once its grammar has arrived. */
  readonly languageLeft: Extension | null;
  readonly languageRight: Extension | null;
  readonly onLeftChange: (text: string) => void;
  readonly onRightChange: (text: string) => void;
}) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const panes = React.useRef<MergeView | null>(null);
  // A grammar is fetched with the document that needs it, so it arrives after
  // the panes are on screen. It is swapped into a compartment rather than
  // built into them, because rebuilding to add it would take away the caret and
  // the undo history of whatever has already been typed.
  const slotLeft = React.useRef(new Compartment());
  const slotRight = React.useRef(new Compartment());
  const notifyLeft = React.useRef(onLeftChange);
  const notifyRight = React.useRef(onRightChange);
  const notifyReady = React.useRef(onReady);
  const notifyPosition = React.useRef(onPosition);
  React.useEffect(() => {
    notifyLeft.current = onLeftChange;
    notifyRight.current = onRightChange;
    notifyReady.current = onReady;
    notifyPosition.current = onPosition;
  }, [onLeftChange, onRightChange, onReady, onPosition]);

  React.useEffect(() => {
    const parent = host.current;
    if (parent === null) return;

    /*
     * The answer that was computed elsewhere, handed to the package as its own
     * diff. It is asked for the pair it was computed over exactly once, when
     * the panes are built; everything after that is an edit re-comparing its
     * own neighbourhood, and those go to the package's algorithm - with the
     * scan limit written out, because a configuration of our own replaces the
     * package's default rather than adding to it.
     *
     * A fresh array each time, because the package sorts and rewrites the list
     * it is given.
     */
    const override = (a: string, b: string): Change[] =>
      a === left && b === right
        ? changes.map(
            (change) => new Change(change.fromA, change.toA, change.fromB, change.toB),
          )
        : [...presentableDiff(a, b, { scanLimit: 500 })];

    const common = [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      tabMovesFocus,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      editorHighlighting,
      plainTextPaste,
      /*
       * No wrapping here, and it is the alignment that decides it. A wrapped
       * line is two rows tall in one pane and one in the other, so the panes
       * drift apart by a row at a time and the drift is invisible until two
       * lines that should face each other do not. Without wrapping every line
       * is exactly one row in both panes, and a long line is read by scrolling
       * the pane it is in.
       */
      EditorView.theme({ ".cm-scroller": { overflowX: "auto" } }),
      editorSurface,
      marks,
    ];

    const view: MergeView = new MergeView({
      a: {
        doc: left,
        extensions: [
          ...common,
          slotLeft.current.of(languageLeft ?? []),
          EditorView.contentAttributes.of({ "aria-label": labelLeft, tabindex: "0" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) notifyLeft.current(update.state.doc.toString());
            settle();
          }),
        ],
      },
      b: {
        doc: right,
        extensions: [
          ...common,
          slotRight.current.of(languageRight ?? []),
          EditorView.contentAttributes.of({ "aria-label": labelRight, tabindex: "0" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) notifyRight.current(update.state.doc.toString());
            settle();
          }),
        ],
      },
      parent,
      gutter: true,
      diffConfig: { override },
    });

    /** Which pane the reader is in. Both are editable, so both can be asked. */
    const focused = (): "a" | "b" => (view.b.hasFocus ? "b" : "a");

    /** Which change a position in one of the panes falls inside, or -1. */
    const chunkAt = (side: "a" | "b", at: number): number =>
      view.chunks.findIndex((chunk) =>
        side === "a"
          ? at >= chunk.fromA && at <= chunk.endA
          : at >= chunk.fromB && at <= chunk.endB,
      );

    let said: Position = { current: -1, total: -1 };

    /**
     * Which change the caret is standing in, of how many. Standing between two
     * of them is reported as none rather than as the nearer one: a number that
     * moves while nothing has is worse than no number.
     *
     * The same answer is not said twice. What listens to it is React state, and
     * setting state is a render: repeating it on every transaction would put a
     * render inside the editor's own measuring cycle for no new information.
     */
    const report = (): void => {
      const side = focused();
      const at = (side === "a" ? view.a : view.b).state.selection.main.head;
      const now = { current: chunkAt(side, at) + 1, total: view.chunks.length };
      if (now.current === said.current && now.total === said.total) return;
      said = now;
      notifyPosition.current(now);
    };

    /*
     * The two panes are laid out inside one scroller, so the fading edges
     * belong to it rather than to either pane: what they say is that the
     * comparison goes on above and below, and it goes on in both at once.
     */
    const scroller = view.dom;
    const fade = (): void => {
      const top = scroller.scrollTop > 1;
      const bottom =
        scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1;
      scroller.style.setProperty("--cm-fade-top", top ? `${FADE_PX}px` : "0px");
      scroller.style.setProperty("--cm-fade-bottom", bottom ? `${FADE_PX}px` : "0px");
    };

    /*
     * Both of these read the layout and one of them writes to it, so neither
     * happens inside the update that provoked it: the merge view measures the
     * spacers that keep the panes level in that same cycle, and work added to
     * it makes the measurement restart. Coalesced to one frame, they happen
     * after the editor has finished with the layout rather than during it.
     */
    let scheduled = 0;
    const settle = (): void => {
      if (scheduled !== 0) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        report();
        fade();
      });
    };

    scroller.addEventListener("scroll", fade, { passive: true });

    /*
     * Sideways the panes move together. Up and down they are one scroller and
     * cannot come apart; across they are two, and a line read at one offset
     * against a line read at another is not a comparison.
     */
    let mirroring = false;
    const mirror = (from: EditorView, to: EditorView) => (): void => {
      if (mirroring) return;
      mirroring = true;
      to.scrollDOM.scrollLeft = from.scrollDOM.scrollLeft;
      mirroring = false;
    };
    const mirrorA = mirror(view.a, view.b);
    const mirrorB = mirror(view.b, view.a);
    view.a.scrollDOM.addEventListener("scroll", mirrorA, { passive: true });
    view.b.scrollDOM.addEventListener("scroll", mirrorB, { passive: true });

    report();
    fade();

    /**
     * A jump to one change, in two beats.
     *
     * The alignment between the panes is held by spacers whose height the merge
     * view measures after a layout. A jump that scrolls in the same frame as it
     * moves the caret therefore scrolls to where the line was before that
     * measurement, and the two panes stand a line apart until something scrolls
     * and settles them. Moving the caret first and scrolling to it on the next
     * frame asks for the position the measurement has already agreed on.
     */
    const jumpTo = (index: number): void => {
      const chunk = view.chunks[index];
      if (chunk === undefined) return;
      const side = focused();
      const editor = side === "a" ? view.a : view.b;
      // The first word that differs rather than the start of the line it is on:
      // lines are not wrapped here, so the difference can be a screen to the
      // right of where the line begins.
      const inside = chunk.changes[0];
      const start = side === "a" ? chunk.fromA : chunk.fromB;
      const at =
        inside === undefined
          ? start
          : start + (side === "a" ? inside.fromA : inside.fromB);
      editor.focus();
      editor.dispatch({ selection: { anchor: at }, scrollIntoView: false });
      requestAnimationFrame(() => {
        editor.dispatch({
          effects: EditorView.scrollIntoView(at, { y: "center", x: "center" }),
        });
        report();
        fade();
      });
    };

    const step = (by: number): void => {
      const chunks = view.chunks;
      if (chunks.length === 0) return;
      const side = focused();
      const at = (side === "a" ? view.a : view.b).state.selection.main.head;
      const here = chunkAt(side, at);
      if (here !== -1) {
        jumpTo((here + by + chunks.length) % chunks.length);
        return;
      }
      // Between two changes: forwards is the first that begins after the caret,
      // backwards the last that ends before it, and past either end it comes
      // round again.
      const found =
        by > 0
          ? chunks.findIndex((chunk) => (side === "a" ? chunk.fromA : chunk.fromB) > at)
          : findLastIndex(
              chunks,
              (chunk) => (side === "a" ? chunk.endA : chunk.endB) < at,
            );
      jumpTo(found === -1 ? (by > 0 ? 0 : chunks.length - 1) : found);
    };

    notifyReady.current({ next: () => step(1), previous: () => step(-1) });
    panes.current = view;

    return () => {
      notifyReady.current(null);
      panes.current = null;
      if (scheduled !== 0) cancelAnimationFrame(scheduled);
      scroller.removeEventListener("scroll", fade);
      view.a.scrollDOM.removeEventListener("scroll", mirrorA);
      view.b.scrollDOM.removeEventListener("scroll", mirrorB);
      view.destroy();
    };
    /*
     * Built once per answer. The texts and the changes are one thing - an
     * answer about this pair - and re-seeding the panes from a prop as the
     * person types would take away the cursor and the undo history mid-edit.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changes]);

  React.useEffect(() => {
    const view = panes.current;
    if (view === null) return;
    view.a.dispatch({ effects: slotLeft.current.reconfigure(languageLeft ?? []) });
    view.b.dispatch({ effects: slotRight.current.reconfigure(languageRight ?? []) });
  }, [languageLeft, languageRight]);

  return (
    <div
      ref={host}
      data-testid="merge-panes"
      data-diff-panes=""
      className="overflow-hidden rounded-xl border bg-card"
    />
  );
}

function findLastIndex<T>(items: readonly T[], test: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item !== undefined && test(item)) return index;
  }
  return -1;
}
