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
  edgeFade,
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
 *
 * The alignment is ours rather than the package's, and the reason is wrapping.
 * The package lays both panes inside one scroller and keeps them level by
 * padding whichever is shorter, working from heights it has to estimate for the
 * text nobody has scrolled past yet; a wrapped line is where those estimates go
 * wrong, and on a manuscript reached by a jump the two halves of a change ended
 * up a row or two apart. So each pane scrolls itself here, and a jump asks both
 * of them for the same thing: put this change that far below the top edge. Two
 * changes put at the same height are level whatever the text above them turned
 * out to measure.
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

/**
 * Where a change sits after a jump: a third of the way down, so that what came
 * before it is on screen and what follows has room. It is also the distance
 * that makes the two panes level - each is asked for the same one.
 */
const JUMP_MARGIN = 0.33;

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
      EditorView.lineWrapping,
      edgeFade,
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
     * The two panes move together, at whatever distance apart the last jump
     * left them. That distance is the whole of the state: scrolling one sets
     * the other to match it, and a jump measures it again once both panes have
     * settled on the change.
     */
    let apart = 0;
    let linked = true;
    /*
     * Setting the other pane's position raises a scroll event of its own, and
     * that event must not come back as a movement. One flag is enough because
     * one assignment raises exactly one event - and it is only set when the
     * assignment actually changes something.
     */
    let echoing = false;

    const follow = (from: EditorView, to: EditorView, sign: 1 | -1) => (): void => {
      if (!linked) return;
      if (echoing) {
        echoing = false;
        return;
      }
      const want = from.scrollDOM.scrollTop + sign * apart;
      if (Math.abs(to.scrollDOM.scrollTop - want) < 1) return;
      echoing = true;
      to.scrollDOM.scrollTop = want;
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
      });
    };

    const followA = follow(view.a, view.b, 1);
    const followB = follow(view.b, view.a, -1);
    view.a.scrollDOM.addEventListener("scroll", followA, { passive: true });
    view.b.scrollDOM.addEventListener("scroll", followB, { passive: true });

    report();

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
    /**
     * A jump to one change: both panes are asked to put their half of it the
     * same distance below their top edge, so the two halves end up level
     * whatever the text above them measures. The editor does the scrolling
     * itself, which is what keeps the position right after it has measured what
     * it had only estimated.
     *
     * The caret is moved without scrolling first, and the page is left where it
     * was: focusing a text field is enough to make a browser scroll the whole
     * page to it, and the panes are on screen already.
     */
    const jumpTo = (index: number): void => {
      const chunk = view.chunks[index];
      if (chunk === undefined) return;
      const side = focused();
      const editor = side === "a" ? view.a : view.b;
      const at = side === "a" ? chunk.fromA : chunk.fromB;
      const margin = Math.round(editor.scrollDOM.clientHeight * JUMP_MARGIN);
      const pageY = window.scrollY;

      editor.contentDOM.focus({ preventScroll: true });
      editor.dispatch({ selection: { anchor: at }, scrollIntoView: false });

      /*
       * Each pane is put where it belongs by its own arithmetic: the top of the
       * change, less the margin. Twice, a frame apart, because the first move
       * brings text into view that the editor had only estimated the height of,
       * and the second asks again now that it has been measured.
       *
       * Neither pane follows the other while this happens - what they are being
       * placed against is the change, not each other - and the distance they
       * end up apart becomes the distance they keep afterwards.
       */
      linked = false;
      const place = (): void => {
        view.a.scrollDOM.scrollTop = view.a.lineBlockAt(chunk.fromA).top - margin;
        view.b.scrollDOM.scrollTop = view.b.lineBlockAt(chunk.fromB).top - margin;
      };
      place();
      requestAnimationFrame(() => {
        place();
        requestAnimationFrame(() => {
          place();
          apart = view.b.scrollDOM.scrollTop - view.a.scrollDOM.scrollTop;
          linked = true;
          // Focusing a text field is enough to make a browser scroll the whole
          // page to it, and the panes were on screen already.
          if (window.scrollY !== pageY) window.scrollTo({ top: pageY });
          report();
        });
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
      view.a.scrollDOM.removeEventListener("scroll", followA);
      view.b.scrollDOM.removeEventListener("scroll", followB);
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
