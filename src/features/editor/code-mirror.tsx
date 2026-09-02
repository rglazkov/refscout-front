"use client";

import * as React from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";

/**
 * The editor core, in its minimal configuration. Virtualised rendering so that
 * a hundred pages do not lay the tab down, line numbers in the gutter, editing,
 * and undo in steps. There is no search, no syntax highlighting and no font
 * switch here yet.
 *
 * It is written from the start as one component with modes rather than as a
 * viewer that will be replaced later. Each further mode arrives as a set of
 * extensions, while the behaviour - scrolling, selection, the keyboard, what a
 * phone does - is written and fixed once.
 */
export type CodeMirrorProps = {
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange?: (value: string) => void;
  readonly ariaLabel: string;
  /**
   * The language of this document, once it has been fetched. It arrives after
   * the editor is already on screen and is swapped in through a compartment,
   * because rebuilding the editor to add it would throw away the cursor and the
   * undo history of whatever the person had already typed.
   */
  readonly language?: Extension | null;
  /** Extensions the mode adds. The finding highlights go in through here. */
  readonly extensions?: readonly Extension[];
  readonly className?: string;
};

/**
 * The syntax palette. Every colour is a token, because the dark theme drifts
 * away from the light one exactly one hard-coded colour at a time, and because
 * these are read for hours: each one is held against the editor's own surface
 * at the text threshold by the contrast test.
 *
 * Four roles cover the three formats, and every tag the three grammars emit is
 * named against one of them. That last part is the whole of it: a tag nobody
 * mapped is not an error anywhere, it is simply text of the ordinary colour, so
 * a grammar can be wired up, appear to work, and leave most of a document flat -
 * which is what Markdown did, where only the three tags shared with LaTeX had
 * been named and the hashes, the list markers and the code spans had not.
 *
 * Marks are typed rather than decorative - nothing here fills a surface or
 * changes a size - so the document stays a document and does not turn into
 * rendered markup.
 */
const highlightStyle = HighlightStyle.define([
  /*
   * What a thing IS: a LaTeX command, a BibTeX entry type, a Markdown heading.
   * `heading1`..`heading6` derive from `heading` and are covered by it.
   */
  {
    tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.definitionKeyword],
    color: "var(--syntax-keyword)",
  },
  { tag: [tags.tagName, tags.typeName, tags.namespace], color: "var(--syntax-keyword)" },
  { tag: tags.heading, color: "var(--syntax-keyword)", fontWeight: "600" },

  // What a thing is CALLED: a field name, a citation key, the target of a link.
  {
    tag: [
      tags.propertyName,
      tags.attributeName,
      tags.variableName,
      tags.definition(tags.variableName),
    ],
    color: "var(--syntax-name)",
  },
  { tag: [tags.labelName, tags.link, tags.url], color: "var(--syntax-name)" },

  /*
   * What a thing SAYS: a braced value, a quoted string, a span of code. Not
   * `content`, which is how Markdown tags the prose inside a list or a quote -
   * prose in a list is prose, and colouring it would leave a document where the
   * only black text is the paragraphs.
   */
  {
    tag: [tags.string, tags.special(tags.string), tags.character, tags.monospace],
    color: "var(--syntax-string)",
  },

  {
    tag: [tags.number, tags.bool, tags.atom, tags.escape],
    color: "var(--syntax-number)",
  },

  /*
   * The scaffolding: comments, braces, and the characters Markdown is built out
   * of - the hashes of a heading, the asterisks of emphasis, the dashes of a
   * list. They are held back rather than coloured, so that what they mark up
   * stands in front of them.
   */
  {
    tag: [
      tags.comment,
      tags.lineComment,
      tags.blockComment,
      tags.punctuation,
      tags.bracket,
      tags.separator,
      tags.operator,
      tags.processingInstruction,
      tags.contentSeparator,
    ],
    color: "var(--muted-foreground)",
  },

  /*
   * Emphasis is the one place the source says something a colour cannot: the
   * marks are in the text already, and the type follows them.
   *
   * Bold is set at the top of the face's axis rather than a step above the
   * body, and the reason is the dark theme. Light letters on a dark ground
   * bloom, which lifts every weight and squeezes the distance between them:
   * the step that reads clearly on white is nearly invisible on black, and
   * bold that cannot be told from plain text is not marking anything. Italic
   * needs no such help, because it changes the shape of the letter and not its
   * weight.
   */
  { tag: tags.strong, fontWeight: "800" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
]);

/**
 * Tab moves the focus onwards instead of inserting an indent. Without this
 * there is no way out of an editor inside a modal overlay with the keyboard,
 * which makes the overlay a trap rather than a dialogue.
 */
const tabMovesFocus = keymap.of([{ key: "Tab", run: () => false, shift: () => false }]);

/**
 * CodeMirror works through `contenteditable`, so a paste carries whatever the
 * clipboard holds. Only `text/plain` is taken: copying out of Word or a web
 * page also puts `text/html` on the clipboard, with markup and external links
 * in it, and anything accepted here eventually reaches the DOM.
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
    // Not smaller than 16px: iOS zooms the page when a field with a smaller one
    // takes focus, and the person then edits a document at 1.3x.
    fontSize: "16px",
    height: "100%",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
  },
  ".cm-content": { fontFamily: "var(--stack-mono)", padding: "12px 0" },
  /*
   * The scrolled text fades out at the two edges instead of being cut across a
   * line. The mask is on the scroller, so the gutter fades with the text and
   * the two stay one surface; 20px is about one line, which is enough to read
   * as "there is more above" without hiding a line that is still being read.
   */
  ".cm-scroller": {
    maskImage:
      "linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
  },
  /*
   * The gutter is a column of cells rather than a column of numbers, as the
   * prototype draws it: a surface a step off the text, a rule between the two,
   * and each number right-aligned in its own cell. It gives the eye an edge to
   * run down, which is the whole use of a line number in a hundred-page
   * document.
   */
  ".cm-gutters": {
    backgroundColor: "color-mix(in srgb, var(--muted) 45%, var(--card))",
    color: "color-mix(in srgb, var(--muted-foreground) 70%, transparent)",
    border: "none",
    borderRight: "1px solid var(--border)",
    fontFamily: "var(--stack-mono)",
    fontSize: "0.8125rem",
    fontVariantNumeric: "tabular-nums",
    userSelect: "none",
  },
  /*
   * The cells are not ruled off from one another. A line between every pair of
   * numbers turns a quiet column into a ladder of a hundred rungs standing
   * beside the text a person is trying to read: the column is separated from
   * the text, and that is the separation the eye needed.
   */
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 0.5rem 0 1rem",
    minWidth: "3rem",
    transition: "background-color var(--motion-fast) var(--ease-out)",
  },
  /*
   * The cell of the line the cursor is on takes the same fill the text of that
   * line takes, so the two read as one row rather than as a lit line beside an
   * unlit number. Colour only: the cell keeps its size, or the whole column
   * would shift by a pixel as the cursor moves.
   */
  ".cm-activeLineGutter": {
    backgroundColor: "var(--accent-bg)",
    color: "var(--foreground)",
    fontWeight: "600",
  },
  // The active line is only an orientation cue. The actual selection must be
  // visibly stronger, especially when it sits on that same line.
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--accent-bg) 55%, transparent)",
  },
  /*
   * Selected text is read, not just spotted, so the fill stays on its theme's
   * side of the scale and the line around it does the work of being seen. The
   * two colours are tokens rather than a mix computed here: a fill invented in
   * a component is a fill no contrast test can reach, and this one carries the
   * whole syntax palette on top of it in both themes.
   */
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--editor-selection) !important",
    boxShadow: "inset 0 0 0 1px var(--editor-selection-line)",
  },
  ".cm-content ::selection": { backgroundColor: "var(--editor-selection)" },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
});

export function CodeMirror({
  value,
  readOnly = false,
  onChange,
  ariaLabel,
  language = null,
  extensions = [],
  className,
}: CodeMirrorProps) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const view = React.useRef<EditorView | null>(null);
  const notify = React.useRef(onChange);
  const languageSlot = React.useRef(new Compartment());
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
        highlightActiveLineGutter(),
        tabMovesFocus,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        languageSlot.current.of(language ?? []),
        syntaxHighlighting(highlightStyle),
        plainTextPaste,
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          role: "textbox",
          "aria-multiline": "true",
          /*
           * CodeMirror leaves its `contenteditable` element without a tabindex,
           * and a bare contenteditable reports `tabIndex === -1`. Nothing that
           * enumerates tab stops can see the field then: Tab does not reach it
           * from the buttons above it, and the focus trap of the overlay it
           * sits in counts two buttons and no field - so a Tab out of the text
           * is a Tab out of the modal, into a page the person cannot see.
           */
          tabindex: "0",
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

  // The parser arrives after the editor does, and it is reconfigured into the
  // compartment rather than rebuilt around: the document, the selection and the
  // undo history all stay where they were.
  React.useEffect(() => {
    const created = view.current;
    if (created === null) return;
    created.dispatch({
      effects: languageSlot.current.reconfigure(language ?? []),
    });
  }, [language]);

  return <div ref={host} className={className} data-testid="editor" />;
}
