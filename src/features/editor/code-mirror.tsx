"use client";

import * as React from "react";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import {
  EditorView,
  ViewPlugin,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type ViewUpdate,
} from "@codemirror/view";

import { type TextEdit } from "@/lib/docs";

/**
 * The editor core. Virtualised rendering so that a hundred pages do not lay the
 * tab down, line numbers in the gutter, editing, undo in steps, search over the
 * whole document, syntax colouring for the formats that have any, and a choice
 * of face.
 *
 * It is one component with modes rather than a viewer that is replaced later.
 * Each mode arrives as a set of extensions, while the behaviour - scrolling,
 * selection, the keyboard, what a phone does - is written and fixed once.
 */
export type EditorFace = "mono" | "prose";

export type CodeMirrorProps = {
  readonly value: string;
  readonly readOnly?: boolean;
  readonly onChange?: (value: string) => void;
  /**
   * What each edit did, in the coordinates of the text before it. The whole
   * string says what the document now is; this says what moved, which is what
   * lets a place counted over the text that was sent be found again in the text
   * that is here now without recomputing the list on every keystroke.
   */
  readonly onEdits?: (edits: readonly TextEdit[]) => void;
  /**
   * The editor itself, once there is one, and `null` when it goes. Jumping to a
   * finding, scrolling to it and applying a replacement are all one transaction
   * against this - the same path a keystroke takes, so that undo takes them
   * back the way it takes back typing.
   */
  readonly onReady?: (view: EditorView | null) => void;
  readonly ariaLabel: string;
  /**
   * Which face the document is set in. A bibliography and a `.tex` are read
   * character by character and line up in columns, so they are monospaced;
   * prose pulled out of a PDF is read for an hour at a time, which a
   * monospaced face makes measurably harder. The switch beside it is there
   * because the document decides badly often enough to be worth overruling.
   */
  readonly face?: EditorFace;
  /**
   * The words the editor's own panels use, out of the dictionary. The search
   * panel is the library's markup and it carries English inside it; handed
   * these, it says what everything else on the screen says, in the language
   * being read.
   */
  readonly phrases?: Readonly<Record<string, string>>;
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
 * The default, as one value rather than a fresh array per render. A new empty
 * array each time is a new identity each time, and the effect that hands the
 * set to the editor would then dispatch a reconfiguration on every render of
 * every editor in the product for no change at all.
 */
const NO_EXTENSIONS: readonly Extension[] = [];

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

/** How far the text dissolves at an edge that has more text behind it. */
const FADE_PX = 20;

/**
 * Fades an edge of the scrolled text only while that edge is hiding something.
 *
 * A mask dims every pixel under it, and the caret is one of them: with a fade
 * standing permanently at the top, a caret placed on the first line - which is
 * where it starts every time a document is opened - was drawn at a fraction of
 * its colour and read as a pale smear on a light background, then turned solid
 * as soon as a click moved it further down the page. The fade is there to say
 * "there is more above", so at the top of a document it says nothing and is
 * switched off; the same holds at the bottom.
 *
 * The distances are written to the scroller as custom properties, so the mask
 * itself stays one declaration in the theme.
 */
const edgeFade = ViewPlugin.fromClass(
  class {
    private readonly onScroll = () => this.sync();

    constructor(private readonly view: EditorView) {
      view.scrollDOM.addEventListener("scroll", this.onScroll, { passive: true });
      this.sync();
    }

    /*
     * A document that grew, shrank or was laid out again changes which edges
     * have something behind them without anybody scrolling. Reading the layout
     * from inside an update would force it to be recomputed mid-cycle, so the
     * question is asked in the measure phase, which is where the editor is
     * willing to be asked about its geometry.
     */
    update(update: ViewUpdate) {
      if (update.geometryChanged || update.docChanged) {
        this.view.requestMeasure({
          read: () => this.hidden(),
          write: (at) => this.write(at),
        });
      }
    }

    destroy() {
      this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    }

    /** Which edges have text behind them, and so have something to fade. */
    private hidden() {
      const el = this.view.scrollDOM;
      // A pixel of slack: a fractional scroll offset or content height would
      // otherwise leave a fade standing at an edge that is already flush.
      return {
        top: el.scrollTop > 1,
        bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
      };
    }

    private write(at: { readonly top: boolean; readonly bottom: boolean }) {
      const el = this.view.scrollDOM;
      el.style.setProperty("--cm-fade-top", at.top ? `${FADE_PX}px` : "0px");
      el.style.setProperty("--cm-fade-bottom", at.bottom ? `${FADE_PX}px` : "0px");
    }

    private sync() {
      this.write(this.hidden());
    }
  },
);

/**
 * The surface every editor in the product is drawn on: the face, the gutter,
 * the selection, the caret and the two fading edges. It is exported because the
 * comparison panes are the same editor in another arrangement, and a second
 * theme beside this one is how the two start drifting apart a colour at a time.
 *
 * The height is not here. This editor fills its overlay, while the panes of a
 * comparison are laid out by the merge view inside one scroller, so each says
 * how tall it is where it is used.
 */
export const editorSurface = EditorView.theme({
  "&": {
    // Not smaller than 16px: iOS zooms the page when a field with a smaller one
    // takes focus, and the person then edits a document at 1.3x.
    fontSize: "16px",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
  },
  ".cm-content": { fontFamily: "var(--stack-mono)", padding: "12px 0" },
  /*
   * The scrolled text fades out at the two edges instead of being cut across a
   * line. The mask is on the scroller, so the gutter fades with the text and
   * the two stay one surface; 20px is about one line, which is enough to read
   * as "there is more above" without hiding a line that is still being read.
   *
   * Each distance is a property rather than a constant, because the mask dims
   * everything that lies under it - the caret and the selection as much as the
   * letters - and an edge with nothing behind it would dim them for no reason.
   * A distance of zero puts the two gradient stops in the same place and leaves
   * that edge fully opaque.
   */
  ".cm-scroller": {
    maskImage:
      "linear-gradient(to bottom, transparent 0, black var(--cm-fade-top, 0px), black calc(100% - var(--cm-fade-bottom, 0px)), transparent 100%)",
  },
  /*
   * The gutter is a column of cells rather than a column of numbers: a surface
   * a step off the text, a rule between the two, and each number right-aligned
   * in its own cell. It gives the eye an edge to run down, which is the whole
   * use of a line number in a hundred-page document.
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

  /*
   * The search panel. It is the library's own markup, so it is dressed here
   * rather than rebuilt: what it has to do is stop looking like a browser
   * dialogue that wandered onto the page. The controls take the same surfaces
   * and the same rules the rest of the product uses, and a field with something
   * typed in it sits a visible step off the panel behind it.
   */
  ".cm-panels": {
    backgroundColor: "color-mix(in srgb, var(--muted) 45%, var(--card))",
    color: "var(--foreground)",
    borderBottom: "1px solid var(--border)",
    fontFamily: "var(--stack-sans)",
    fontSize: "0.8125rem",
  },
  ".cm-panels input[type=text], .cm-panels input[type=search]": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
    padding: "0.25rem 0.5rem",
  },
  ".cm-panels input:focus-visible, .cm-panels button:focus-visible": {
    outline: "2px solid var(--ring)",
    outlineOffset: "1px",
  },
  ".cm-panels button": {
    backgroundColor: "var(--card)",
    backgroundImage: "none",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
    padding: "0.25rem 0.5rem",
    transition: "background-color var(--motion-fast) var(--ease-out)",
  },
  ".cm-panels button:hover": { backgroundColor: "var(--accent-bg)" },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--primary) 22%, transparent)",
  },
  ".cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--primary) 40%, transparent)",
  },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in srgb, var(--primary) 14%, transparent)",
  },
});

/** This editor fills the overlay it is opened in. */
const fillsItsBox = EditorView.theme({ "&": { height: "100%" } });

/**
 * The two faces, as a theme each. Which one a document gets is decided where
 * the document is known; here they are only two declarations, so that no screen
 * has to name a font stack of its own.
 */
const faces: Readonly<Record<EditorFace, Extension>> = {
  mono: EditorView.theme({ ".cm-content": { fontFamily: "var(--stack-mono)" } }),
  prose: EditorView.theme({
    ".cm-content": { fontFamily: "var(--stack-sans)", lineHeight: "1.6" },
  }),
};

/** The palette, as an extension, so both arrangements colour alike. */
export const editorHighlighting = syntaxHighlighting(highlightStyle);

export { edgeFade, plainTextPaste, tabMovesFocus };

export function CodeMirror({
  value,
  readOnly = false,
  onChange,
  onEdits,
  onReady,
  ariaLabel,
  face = "mono",
  phrases,
  language = null,
  extensions = NO_EXTENSIONS,
  className,
}: CodeMirrorProps) {
  const host = React.useRef<HTMLDivElement | null>(null);
  const view = React.useRef<EditorView | null>(null);
  const notify = React.useRef(onChange);
  const notifyEdits = React.useRef(onEdits);
  const handOver = React.useRef(onReady);
  const languageSlot = React.useRef(new Compartment());
  const extensionSlot = React.useRef(new Compartment());
  const faceSlot = React.useRef(new Compartment());
  React.useEffect(() => {
    notify.current = onChange;
    notifyEdits.current = onEdits;
    handOver.current = onReady;
  }, [onChange, onEdits, onReady]);

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
        edgeFade,
        tabMovesFocus,
        /*
         * Search over the whole document. On a manuscript of a hundred pages it
         * is not an ornament: a finding that says a term is defined twice is of
         * no use without a way to reach the second definition, and the person
         * reading it is in the text rather than in a browser's own find bar,
         * which cannot see the lines the editor has not drawn.
         */
        search({ top: true }),
        highlightSelectionMatches(),
        EditorState.phrases.of(phrases ?? {}),
        keymap.of([...searchKeymap, ...defaultKeymap, ...historyKeymap]),
        languageSlot.current.of(language ?? []),
        editorHighlighting,
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
        editorSurface,
        faceSlot.current.of(faces[face]),
        fillsItsBox,
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          notify.current?.(update.state.doc.toString());
          /*
           * What moved, as well as what the text now is. Both are needed and
           * they answer different questions: the string is the document, and
           * this is how to find in it a place that was counted over the text as
           * it stood when the check was started.
           */
          const edits: TextEdit[] = [];
          update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            edits.push({ from: fromA, to: toA, length: inserted.length });
          });
          notifyEdits.current?.(edits);
        }),
        extensionSlot.current.of([...extensions]),
      ],
    });

    const created = new EditorView({ state, parent });
    view.current = created;
    handOver.current?.(created);
    created.focus();

    return () => {
      handOver.current?.(null);
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

  /*
   * What a mode adds gets the same treatment, and for a stronger reason: the
   * highlights over the findings are exactly the thing that has to change while
   * a person is reading, as a finding is marked or a card is opened. Handed to
   * the editor once at creation, a later set would simply never arrive - and it
   * would fail silently, because a missing decoration looks like a document
   * with nothing to decorate.
   */
  React.useEffect(() => {
    const created = view.current;
    if (created === null) return;
    created.dispatch({
      effects: extensionSlot.current.reconfigure([...extensions]),
    });
  }, [extensions]);

  // The face is swapped the same way, so that changing it keeps the scroll
  // position and the caret: a person who switches to read prose comfortably
  // does not want to find the document back at the top.
  React.useEffect(() => {
    const created = view.current;
    if (created === null) return;
    created.dispatch({ effects: faceSlot.current.reconfigure(faces[face]) });
  }, [face]);

  return <div ref={host} className={className} data-testid="editor" />;
}
