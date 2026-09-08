// @vitest-environment jsdom
import * as React from "react";
import { EditorState } from "@codemirror/state";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { FindingCard } from "@/features/editor/finding-card";
import {
  type FindingPlace,
  type PanelFinding,
  type PanelSelection,
} from "@/features/editor/findings-model";
import {
  cardBlockIn,
  createCardHost,
  inlineCards,
  setInlineCard,
} from "@/features/editor/inline-card";
import { lineStarts } from "@/lib/docs";
import { asDocOffset, type Place } from "@/lib/domain";
import { fixedKey, useJobStore } from "@/stores";

import messages from "../messages/en.json";

/**
 * The card of a finding, which is drawn in one place: under the line it belongs
 * to, inside the text. There used to be a second drawing of it inside the list
 * beside the text, and these cases ran twice for that reason; the list is an
 * index now and holds no card, so they run once.
 *
 * What is only true of the block the editor holds the card in is written
 * separately at the end: it has three obligations of its own, and all three are
 * invisible when they are met and read as random breakage when they are not.
 */
const TEXT = [
  "Transformer architectures have reshaped how retrieval systems encode",
  "documents, as shown by Smith et al. [22], whose attention formulation",
  "most of the encoders evaluated in this section.",
].join("\n");

const STARTS = lineStarts(TEXT);
const DOC_ID = "doc-1";

function placeAt(from: number, to: number, overrides: Partial<Place> = {}): Place {
  return {
    status: "exact",
    docId: DOC_ID,
    anchor: asDocOffset(from),
    range: { from: asDocOffset(from), to: asDocOffset(to) },
    ...overrides,
  };
}

function findingWith(overrides: Partial<PanelFinding> = {}): PanelFinding {
  const places: readonly FindingPlace[] = overrides.places ?? [
    { key: `${DOC_ID}:bibcheck:issue-1:0`, ordinal: 0, place: placeAt(80, 96) },
    { key: `${DOC_ID}:bibcheck:issue-1:1`, ordinal: 1, place: placeAt(140, 150) },
  ];
  return {
    issueKey: `${DOC_ID}:bibcheck:issue-1`,
    docId: DOC_ID,
    module: "bibcheck",
    issueId: "issue-1",
    severity: "critical",
    titleKey: "issues.RETRACTED_ENTRY",
    code: "RETRACTED_ENTRY",
    copy: "smith2019attention",
    replacement: { value: "jones2021attention", at: 0 },
    evidence: [],
    ...overrides,
    places,
  };
}

type Handlers = {
  readonly onSelect: Mock<(selection: PanelSelection) => void>;
  readonly onClose: Mock<() => void>;
  readonly onStep: Mock<(by: number) => void>;
  readonly onApply: Mock<(finding: PanelFinding, place: FindingPlace) => void>;
  readonly onStartPointing: Mock<(key: string) => void>;
  readonly onStopPointing: Mock<() => void>;
  readonly onAnchorHere: Mock<(key: string) => void>;
  readonly onClearManual: Mock<(key: string) => void>;
};

function handlers(): Handlers {
  return {
    onSelect: vi.fn<(selection: PanelSelection) => void>(),
    onClose: vi.fn<() => void>(),
    onStep: vi.fn<(by: number) => void>(),
    onApply: vi.fn<(finding: PanelFinding, place: FindingPlace) => void>(),
    onStartPointing: vi.fn<(key: string) => void>(),
    onStopPointing: vi.fn<() => void>(),
    onAnchorHere: vi.fn<(key: string) => void>(),
    onClearManual: vi.fn<(key: string) => void>(),
  };
}

function draw(
  handled: Handlers,
  overrides: Partial<PanelFinding> = {},
  at = 0,
): PanelFinding {
  const finding = findingWith(overrides);
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <FindingCard
        finding={finding}
        at={at}
        starts={STARTS}
        pages={[{ page: 4, from: asDocOffset(0), to: asDocOffset(TEXT.length) }]}
        settled={false}
        pointingAt={null}
        {...handled}
      />
    </NextIntlClientProvider>,
  );
  return finding;
}

const written: string[] = [];

beforeEach(() => {
  written.length = 0;
  useJobStore.setState({ fixed: {}, ignored: {} });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
});
afterEach(cleanup);

describe("the card of a finding", () => {
  it("names the place in words before anything is highlighted", () => {
    draw(handlers());
    // The line is counted over the live text by the client, and the page comes
    // from the client's own map: neither arrives over the wire.
    const card = screen.getByTestId("finding-card");
    expect(card.textContent).toContain("line 2");
    expect(card.textContent).toContain("p. 4");
    // One finding in two places is one row with a counter, not two rows.
    expect(screen.getByTestId("occurrence").textContent).toContain("1 of 2");
  });

  it("marks the finding dealt with, and the second press takes the mark off", () => {
    const finding = draw(handlers());
    const key = fixedKey(finding.docId, finding.module, finding.issueId);

    fireEvent.click(screen.getByTestId("mark-fixed"));
    expect(useJobStore.getState().fixed[key]).toBe(true);
    fireEvent.click(screen.getByTestId("mark-fixed"));
    expect(useJobStore.getState().fixed[key]).toBeUndefined();
  });

  it("turning a finding down clears the mark that said it was dealt with", () => {
    const finding = draw(handlers());
    const key = fixedKey(finding.docId, finding.module, finding.issueId);

    fireEvent.click(screen.getByTestId("mark-fixed"));
    fireEvent.click(screen.getByTestId("mark-ignored"));
    expect(useJobStore.getState().ignored[key]).toBe(true);
    expect(useJobStore.getState().fixed[key]).toBeUndefined();
  });

  it("offers the module's replacement at the place the module named", () => {
    const handled = handlers();
    const finding = draw(handled);

    fireEvent.click(screen.getByTestId("apply-replacement"));
    expect(handled.onApply).toHaveBeenCalledWith(finding, finding.places[0]);
  });

  it("does not offer a replacement at the other places of the same finding", () => {
    // The module sent one piece of text for one place. Offered at the second,
    // it would put the correction of the fourth page onto the ninth.
    draw(handlers(), {}, 1);
    expect(screen.queryByTestId("apply-replacement")).toBeNull();
  });

  it("copies what the module offered", () => {
    draw(handlers());
    fireEvent.click(screen.getByTestId("copy-finding"));
    expect(written).toEqual(["smith2019attention"]);
  });

  it("steps to the next place of the same finding", () => {
    const handled = handlers();
    const finding = draw(handled);

    fireEvent.click(screen.getByTestId("next-occurrence"));
    expect(handled.onSelect).toHaveBeenCalledWith({ issueKey: finding.issueKey, at: 1 });
  });

  it("walks the findings from the keyboard, wherever the focus is inside it", () => {
    const handled = handlers();
    draw(handled);

    const card = screen.getByTestId("finding-card");
    fireEvent.keyDown(screen.getByTestId("mark-fixed"), { key: "ArrowDown" });
    fireEvent.keyDown(card, { key: "ArrowUp" });
    expect(handled.onStep.mock.calls).toEqual([[1], [-1]]);
  });

  it("marks and copies from the keyboard as well as from the buttons", () => {
    const finding = draw(handlers());
    const card = screen.getByTestId("finding-card");

    fireEvent.keyDown(card, { key: "f" });
    expect(
      useJobStore.getState().fixed[
        fixedKey(finding.docId, finding.module, finding.issueId)
      ],
    ).toBe(true);
    fireEvent.keyDown(card, { key: "c" });
    expect(written).toEqual(["smith2019attention"]);
  });

  it("a place that could not be found says so and offers to be pointed at", () => {
    const handled = handlers();
    const place: FindingPlace = {
      key: `${DOC_ID}:bibcheck:issue-1:0`,
      ordinal: 0,
      place: { status: "lost", docId: DOC_ID },
    };
    draw(handled, { places: [place], replacement: undefined });

    expect(screen.queryByTestId("place-lost")).not.toBeNull();
    fireEvent.click(screen.getByTestId("point-at-place"));
    expect(handled.onStartPointing).toHaveBeenCalledWith(place.key);
  });

  it("a place pointed at by hand can be changed or taken off again", () => {
    const handled = handlers();
    const place: FindingPlace = {
      key: `${DOC_ID}:bibcheck:issue-1:0`,
      ordinal: 0,
      place: placeAt(80, 96, { status: "manual" }),
    };
    draw(handled, { places: [place], replacement: undefined });

    fireEvent.click(screen.getByTestId("clear-manual-place"));
    expect(handled.onClearManual).toHaveBeenCalledWith(place.key);
  });

  it("a fragment edited since the check read it says so", () => {
    draw(handlers(), {
      places: [
        {
          key: `${DOC_ID}:bibcheck:issue-1:0`,
          ordinal: 0,
          place: placeAt(80, 96, { edited: true }),
        },
      ],
      replacement: undefined,
    });
    expect(screen.getByTestId("finding-card").textContent).toContain(
      "you have edited this fragment",
    );
  });
});

/**
 * The block the card is held in inside the text. Three obligations, and each of
 * them costs the person something specific when it is not met: a widget that
 * is not compared by content is rebuilt under their hands and takes the focus
 * with it, a widget that does not claim its events has buttons the editor eats,
 * and a widget that does not declare a height moves the line they were reading.
 */
describe("the block the card stands in", () => {
  const host = () => {
    const element = createCardHost();
    // A widget is measured where it is drawn; nothing here is laid out, so the
    // element answers what an element with no layout answers.
    document.body.append(element);
    return element;
  };

  function stateWith(card: { key: string; at: number; host: HTMLElement } | null) {
    const state = EditorState.create({ doc: TEXT, extensions: [...inlineCards()] });
    return state.update({ effects: setInlineCard.of(card) }).state;
  }

  it("stands under the line its finding falls on, not inside the sentence", () => {
    const state = stateWith({ key: "place-1", at: 80, host: host() });
    const block = cardBlockIn(state);
    expect(block?.from).toBe(state.doc.line(2).to);
  });

  it("a rebuilt widget holding the same card is the same widget", () => {
    /*
     * Which is what keeps the focus. The decorations are rebuilt whenever a
     * result lands or a mark is made, and each rebuild makes a new object; if
     * the editor took each one for a different widget it would throw the card's
     * DOM away and build it again, several times a second while a check
     * finished, with the button somebody had just reached in it.
     */
    const element = host();
    const first = cardBlockIn(stateWith({ key: "place-1", at: 80, host: element }));
    const again = cardBlockIn(stateWith({ key: "place-1", at: 80, host: element }));
    expect(first?.widget.eq(again?.widget ?? first.widget)).toBe(true);

    const elsewhere = cardBlockIn(stateWith({ key: "place-2", at: 80, host: element }));
    expect(first?.widget.eq(elsewhere?.widget ?? first.widget)).toBe(false);
  });

  it("keeps its events to itself", () => {
    const block = cardBlockIn(stateWith({ key: "place-1", at: 80, host: host() }));
    expect(block?.widget.ignoreEvent()).toBe(true);
  });

  it("says how tall it is before it has ever been drawn", () => {
    const block = cardBlockIn(stateWith({ key: "place-1", at: 80, host: host() }));
    expect(block?.widget.estimatedHeight).toBeGreaterThan(0);
  });

  it("is carried by an edit above it, and stays at the end of a line", () => {
    const element = host();
    const opened = stateWith({ key: "place-1", at: 80, host: element });
    const edited = opened.update({
      changes: { from: 0, insert: "A sentence added above everything else.\n" },
    }).state;

    const block = cardBlockIn(edited);
    expect(block?.from).toBe(edited.doc.line(3).to);
  });

  it("goes when the card closes", () => {
    expect(cardBlockIn(stateWith(null))).toBeNull();
  });
});
