"use client";

import * as React from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from "@codemirror/view";

/**
 * The editor core, in its minimal configuration (M1.5.2). Virtualised rendering
 * so that a hundred pages do not lay the tab down, line numbers in the gutter,
 * editing, and undo in steps. There is no search, no syntax highlighting and no
 * font switch here - those are M9.
 *
 * It is written from the start as one component with modes rather than as a
 * viewer that will be replaced later. The modes are added in M3, M9 and M11 as
 * sets of extensions, while the behaviour - scrolling, selection, the keyboard,
 * what a phone does - is written and fixed once.
 */
export type CodeMirrorProps = {
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange?: (value: string) => void;
  readonly ariaLabel: string;
  /** Extensions the mode adds. M3 puts the finding highlights in through here. */
  readonly extensions?: readonly Extension[];
  readonly className?: string;
};

/**
 * Tab moves the focus onwards instead of inserting an indent. Without this
 * there is no way out of an editor inside a modal overlay with the keyboard,
 * which makes the overlay a trap rather than a dialogue (M1.5.3).
 */
const tabMovesFocus = keymap.of([{ key: "Tab", run: () => false, shift: () => false }]);

/**
 * CodeMirror works through `contenteditable`, so a paste carries whatever the
 * clipboard holds. Only `text/plain` is taken: copying out of Word or a web
 * page also puts `text/html` on the clipboard, with markup and external links
 * in it, and anything accepted here eventually reaches the DOM (§19).
 */
const plainTextPaste = EditorView.domEventHandlers({
  paste(event, view) {
    const clipboard = event.clipboardData;
    if (clipboard === null) return false;
    const text = clipboard.getData("text/plain");
    event.preventDefault();
    view.dispatch(view.state.replaceSelection(text));
    return true;
  },
});

const baseTheme = EditorView.theme({
  "&": {
    // Not smaller than 16px: iOS zooms the page when a field with a smaller
    // one takes focus, and the person then edits a document at 1.3x (M1.5.6).
    fontSize: "16px",
    height: "100%",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
  },
  /*
   * The text does not start against the frame. The padding goes on the content
   * rather than on the scroller, so the gutter keeps running the full height as
   * a rail should while the lines - and the numbers, which CodeMirror positions
   * from the same line boxes - come away from the top and bottom edges. It also
   * gives the last line of a long document somewhere to sit when the editor is
   * scrolled to the end.
   */
  ".cm-content": { fontFamily: "var(--stack-mono)", padding: "18px 0" },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    border: "none",
  },
  // The active line is only an orientation cue. The actual selection must be
  // visibly stronger, especially when it sits on that same line.
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent-bg) 55%, transparent)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--primary) 44%, var(--card)) !important",
    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--primary) 82%, transparent)",
  },
  ".cm-content ::selection": {
    backgroundColor: "color-mix(in srgb, var(--primary) 46%, var(--card))",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
});

export function CodeMirror({
  value,
  readOnly = false,
  onChange,
  ariaLabel,
  extensions = [],
  className,
}: CodeMirrorProps) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const view = React.useRef<EditorView | null>(null);
  const notify = React.useRef(onChange);
  React.useEffect(() => {
    notify.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    const parent = host.current;
    if (parent === null) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        tabMovesFocus,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        plainTextPaste,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          role: "textbox",
          "aria-multiline": "true",
        }),
        baseTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) notify.current?.(update.state.doc.toString());
        }),
        ...extensions,
      ],
    });

    const created = new EditorView({ state, parent });
    view.current = created;
    created.focus();

    return () => {
      created.destroy();
      view.current = null;
    };
    // The document is handed over once, at creation: after that the editor owns
    // it, and every change reaches the caller through onChange. Re-seeding it
    // from a prop would throw away the cursor and the undo history on every
    // keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, ariaLabel]);

  return <div ref={host} className={className} data-testid="editor" />;
}
