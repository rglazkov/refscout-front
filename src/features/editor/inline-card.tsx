"use client";

import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

/**
 * The open finding's card, standing in the text under the line it belongs to.
 *
 * The card itself is not built here and nothing about a finding is known here.
 * What this module owns is the one hard part: putting a piece of the page
 * inside a virtualised editor without the editor and the page fighting over it.
 * The card is rendered by React into a host element that React owns and keeps,
 * and the editor is handed that element to place. So there is one React tree
 * with one set of translations, one theme and one store behind it, rather than
 * a second root mounted inside a widget and cut off from all three.
 *
 * Exactly one card is open at a time. A hundred findings drawn as a hundred
 * blocks between the paragraphs is a document nobody can read, so the places
 * are all marked and the card is the one being read: the arrows, a press on a
 * highlight and a press in the list beside the text all move it.
 */
export type InlineCard = {
  /** Which place it is standing at: document, module, finding and ordinal. */
  readonly key: string;
  /** Where in the document the card belongs - anywhere on its line. */
  readonly at: number;
  /** The element React draws the card into. Stable for the life of the screen. */
  readonly host: HTMLElement;
};

/** Opens a card, moves it to another finding, or takes it away with `null`. */
export const setInlineCard = StateEffect.define<InlineCard | null>();

/**
 * What a card is assumed to be worth in height before one has ever been drawn.
 *
 * The editor lays out a document it has not rendered by asking every widget how
 * tall it expects to be, so a widget that says nothing is treated as nothing:
 * the scroll position is computed for a document without it, and the person
 * reading loses their place at the moment the card appears. A card is a
 * headline, a line of places and a row of buttons, which is about this.
 */
const ESTIMATED_HEIGHT_PX = 132;

export class CardWidget extends WidgetType {
  constructor(private readonly card: InlineCard) {
    super();
  }

  /**
   * Compared by what it holds, not by the object it arrived in.
   *
   * A new widget instance is built every time the decorations are rebuilt, and
   * the decorations are rebuilt whenever a result lands, a finding is marked or
   * the text is typed into. Without this the editor would take each of those as
   * a different widget, throw the card's DOM away and build it again - and the
   * button somebody had just tabbed to would lose the focus under their hand,
   * several times a second while a check was finishing.
   *
   * The host is the content: it is the element React is drawing this card into,
   * so two widgets holding the same host and the same place are the same card
   * whatever else has changed around them.
   */
  override eq(other: CardWidget): boolean {
    return other.card.host === this.card.host && other.card.key === this.card.key;
  }

  /**
   * How tall it is, answered before it is drawn. Once it has been drawn the
   * element itself is the honest answer, and it is the one that matters: a card
   * whose height the editor guessed at is a card that shifts the lines under it
   * when the guess is corrected.
   */
  override get estimatedHeight(): number {
    const measured = this.card.host.offsetHeight;
    return measured > 0 ? measured : ESTIMATED_HEIGHT_PX;
  }

  /**
   * Everything that happens inside the card belongs to the card.
   *
   * Without this the editor treats a press on a button as a press on the
   * document: it puts the caret where the button is, takes the focus for the
   * text, and the buttons stop working - which reads as a card that is broken
   * rather than as an editor doing its job. The keystrokes go the same way, so
   * the shortcuts the card carries are its own and an "f" typed into a card
   * never reaches the manuscript.
   */
  override ignoreEvent(): boolean {
    return true;
  }

  override toDOM(): HTMLElement {
    return this.card.host;
  }

  /**
   * The element is React's, not the editor's. The editor detaches it when the
   * card moves or closes, and React goes on owning what is inside it, so there
   * is nothing to tear down here - and tearing it down would take the card away
   * from under React while React still believed it was there.
   */
  override destroy(): void {
    /* Intentionally nothing: the host outlives every widget that holds it. */
  }
}

/**
 * The card, placed under the line its finding falls on.
 *
 * A block widget sits at a line boundary and nowhere else, so the position it
 * is given is the end of the line the place is on rather than the place itself.
 * That is also what "under the line" means to the person reading: the sentence
 * they were judged on stays whole above the card.
 */
function build(card: InlineCard | null, doc: Text): DecorationSet {
  if (card === null) return Decoration.none;
  const at = doc.lineAt(Math.max(0, Math.min(card.at, doc.length))).to;
  return Decoration.set([
    Decoration.widget({ widget: new CardWidget(card), block: true, side: 1 }).range(at),
  ]);
}

/**
 * Where the card stands, kept in the editor's own state so that it moves with
 * the text: a paragraph pasted in above the line carries the card down with the
 * line, exactly as it carries the highlight, and nothing recomputes anything.
 */
const opened = StateField.define<{
  readonly card: InlineCard | null;
  readonly decorations: DecorationSet;
}>({
  create: () => ({ card: null, decorations: Decoration.none }),
  update(value, transaction) {
    let card = value.card;
    let moved = false;
    for (const effect of transaction.effects) {
      if (effect.is(setInlineCard)) {
        card = effect.value;
        moved = true;
      }
    }
    /*
     * An edit moves the card with the text it belongs to, and the position is
     * then snapped to the end of whatever line it has landed on: an edit that
     * joins two lines leaves the old line end in the middle of a sentence, and
     * a block widget standing in the middle of a sentence is a set the editor
     * refuses rather than draws.
     */
    if (!moved && transaction.docChanged && card !== null) {
      card = { ...card, at: transaction.changes.mapPos(card.at, 1) };
      moved = true;
    }
    if (!moved) return value;
    return { card, decorations: build(card, transaction.state.doc) };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
});

/**
 * Where the card stands right now and the widget standing there, or nothing
 * when no finding is open. The position is the one the editor is holding, so
 * it has already been carried along by every edit made since the card opened.
 */
export function cardBlockIn(
  state: EditorState,
): { readonly from: number; readonly widget: CardWidget } | null {
  const decorations = state.field(opened, false)?.decorations;
  if (decorations === undefined) return null;
  const cursor = decorations.iter();
  /*
   * A decoration's spec is whatever it was built with, so the editor types it
   * as unknown to whoever reads it back. What we put there is checked rather
   * than asserted: the answer is a card only if it is one.
   */
  const spec: unknown = cursor.value?.spec;
  const widget =
    typeof spec === "object" && spec !== null && "widget" in spec
      ? (spec as { readonly widget: unknown }).widget
      : undefined;
  if (!(widget instanceof CardWidget)) return null;
  return { from: cursor.from, widget };
}

/** The class the host carries, so the room it is given is styled with it. */
const HOST_CLASS = "cm-inline-card";

/**
 * The element the card is drawn into, made once and kept for the life of the
 * screen. Its identity is what tells the editor that a rebuilt widget is the
 * same card, so it must not be built again per render.
 */
export function createCardHost(): HTMLElement {
  const host = document.createElement("div");
  host.className = HOST_CLASS;
  /*
   * Not part of the text, and said here rather than left to the editor. The
   * editor marks a widget it made itself, and this one it did not: the element
   * is built once and handed to every widget that stands here, so the moment
   * the editor would have marked it has already passed. Unmarked, the card is
   * inside an editable region - the caret can be put among its buttons, a
   * selection can run through it, and what a screen reader announces is a run
   * of editable text where a group of controls is standing.
   */
  host.contentEditable = "false";
  return host;
}

/**
 * How the card sits in the text. The block itself is dressed where it is
 * written, in the page's own components; what belongs here is only the room it
 * is given, so that the card lines up with the text rather than with the gutter.
 */
const inlineCardTheme = EditorView.theme({
  [`.${HOST_CLASS}`]: { padding: "0.25rem 0.75rem 0.5rem" },
});

/** The whole thing, as one extension the editor is handed. */
export function inlineCards(): readonly Extension[] {
  return [opened, inlineCardTheme];
}
