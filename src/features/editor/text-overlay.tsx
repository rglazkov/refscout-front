"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { EditorView } from "@codemirror/view";
import {
  BookOpenIcon,
  CodeIcon,
  FileCodeIcon,
  FileTextIcon,
  TypeIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import {
  clearManualPlace,
  reresolveDocument,
  setManualPlace,
  moveManualPlaces,
  useDocumentPlaces,
} from "@/lib/anchor";
import {
  docRegistry,
  countCodePoints,
  downloadFormatsOf,
  countWords,
  lineStarts,
  proposeChecks,
  recordEdits,
  replaceText,
  setBibEntries,
  sha256Hex,
  type TextEdit,
} from "@/lib/docs";
import { asDocOffset, hasStructure, type ModuleResult } from "@/lib/domain";
import { downloadDocumentText } from "@/lib/export";
import { useBufferStore, useJobStore, useUiStore } from "@/stores";
import { readStructureOf } from "@/workers";

import { CodeMirror, type EditorFace } from "./code-mirror";
import { DownloadMenu } from "./download-menu";
import { FindingCard, FindingsToolbar } from "./finding-card";
import {
  findingHighlights,
  setActiveFinding,
  setFindings,
  type EditorFinding,
} from "./findings";
import {
  panelFindings,
  type FindingPlace,
  type PanelFinding,
  type PanelSelection,
} from "./findings-model";
import { FindingsPanel } from "./findings-panel";
import { createCardHost, inlineCards, setInlineCard } from "./inline-card";
import { MarkdownPreview, type PageFace } from "./preview";
import { syntaxKindOf, useSyntax } from "./syntax";
import { useNarrowScreen } from "./use-narrow";
import { useVisualViewportFrame } from "./use-visual-viewport";

/**
 * The text of a document, over the page. A click on the name opens it; the page
 * underneath stays where it is, because rebuilding the buffer and the plan
 * behind the overlay would throw away the scroll position and every card the
 * person had opened.
 *
 * Modality by the rules: the focus is locked inside, Esc closes, and afterwards
 * the focus returns to the control the overlay was opened from. All three come
 * from the dialogue primitive rather than from a hand-rolled trap.
 */
const RECOMPUTE_DELAY_MS = 400;

export function TextOverlay({
  results = {},
}: {
  /**
   * The bodies of the checks that have finished, by document and module. The
   * places come from the resolver; this is where the words come from, and the
   * two are joined where the list beside the text is built.
   */
  readonly results?: Readonly<Record<string, ModuleResult>>;
}) {
  const overlay = useUiStore((state) => state.overlay);
  const retained = useUiStore((state) => state.retainedOverlay);
  const closeOverlay = useUiStore((state) => state.closeOverlay);

  const shown = overlay ?? retained;
  if (shown === null) return null;
  return (
    <OverlayBody
      key={shown.docId}
      open={overlay !== null}
      docId={shown.docId}
      results={results}
      {...(shown.focus === undefined ? {} : { focus: shown.focus })}
      onClose={closeOverlay}
    />
  );
}

function OverlayBody({
  open,
  docId,
  results,
  focus,
  onClose,
}: {
  readonly open: boolean;
  readonly docId: string;
  readonly results: Readonly<Record<string, ModuleResult>>;
  readonly focus?: string;
  readonly onClose: () => void;
}) {
  const t = useTranslations("editor");
  const item = useBufferStore((state) => state.items.find((entry) => entry.id === docId));
  const patchExtract = useBufferStore((state) => state.patchExtract);
  const propose = useBufferStore((state) => state.propose);
  const setLocalFindings = useBufferStore((state) => state.setLocalFindings);
  const frame = useVisualViewportFrame();

  // Asked for by what the document is, and fetched while the overlay opens. The
  // hook is called before the early return below, because a hook is.
  const kind = item === undefined ? null : syntaxKindOf(item.sourceFormat, item.detected);
  const language = useSyntax(kind);

  /*
   * Which of the two the overlay is showing. A document has a preview exactly
   * when it is markdown - a Word file, which is markdown from the moment it was
   * read, an `.md`, or text typed as markdown - and the same question decides
   * how the source is coloured, so it is asked once and answered once. Text out
   * of a PDF, a `.tex` and a bibliography have no preview because there is
   * nothing in them to preview.
   */
  const previewable = kind === "markdown";
  const [view, setView] = React.useState<"code" | "preview">("code");
  const shown = previewable ? view : "code";

  /*
   * Which face the document is set in. The kind of document decides at first -
   * a bibliography and a `.tex` line up in columns and are read character by
   * character, prose out of a PDF is read for an hour - and the switch is there
   * because that guess is worth overruling.
   */
  const [face, setFace] = React.useState<EditorFace>(() =>
    kind === "bibtex" || kind === "latex" ? "mono" : "prose",
  );

  /*
   * And which face the drawn page is set in, which is a second question and not
   * the same one: the source is a text with markup in it and the page is a
   * document, so a monospaced position that is right for a bibliography means
   * nothing on a page that has no columns to line up. The switch keeps its
   * place in the row and answers whichever question is on the screen.
   */
  const [pageFace, setPageFace] = React.useState<PageFace>("serif");

  const content = docRegistry.get(docId);
  const initial = content?.text ?? "";
  const [chars, setChars] = React.useState(() => countCodePoints(initial));
  /**
   * The document as the list beside it last saw it. It follows the same delay
   * the counters do: the line a finding falls on is worked out by walking the
   * whole text, and doing that per keystroke on a dissertation is a field that
   * lags behind the person using it.
   */
  const [settledText, setSettledText] = React.useState(initial);
  const pending = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The text the counters have not caught up with yet, or nothing owed. */
  const owed = React.useRef<string | null>(null);
  const sourceFormat = item?.sourceFormat;

  const editor = React.useRef<EditorView | null>(null);
  /*
   * Which finding the person has picked, and the one value that says they have
   * picked none. "Nothing chosen yet" and "chosen and then closed" are two
   * different answers: the first falls back to the finding the overlay was
   * opened on, and the second must not - a card put away would open itself
   * again on the next render.
   */
  const [chosen, setChosen] = React.useState<PanelSelection | "closed" | null>(null);
  const [pointingAt, setPointingAt] = React.useState<string | null>(null);

  const placed = useDocumentPlaces(docId);
  const findings = React.useMemo(() => panelFindings(placed, results), [placed, results]);

  /**
   * Everything the card shows about this text, recomputed from it. Every line
   * here walks the whole document, so it happens once the typing stops rather
   * than on each keystroke: on a dissertation the character count alone is
   * about a frame's worth of work, and paying it per keypress is a field that
   * lags behind the person using it.
   */
  const settle = React.useCallback(() => {
    const next = owed.current;
    if (pending.current !== null) {
      clearTimeout(pending.current);
      pending.current = null;
    }
    if (next === null) return;
    owed.current = null;

    const stored = docRegistry.get(docId);
    if (stored === undefined) return;

    const counted = countCodePoints(next);
    setChars(counted);
    setSettledText(next);
    /*
     * And the places are worked out again over the text as it now stands. The
     * highlights have already moved with the edit - that is the editor's own
     * doing and it is immediate - and this is the slower half: a fragment that
     * was typed into is checked against what the module quoted, one that came
     * back through an undo gets its highlight back, and the rest keep theirs.
     */
    reresolveDocument(docId);
    void sha256Hex(next).then((sha256) => {
      patchExtract(docId, {
        chars: counted,
        words: countWords(next),
        /*
         * Against the hash taken when the text was read, not against what
         * the field held a moment ago: the registry is written on every
         * keystroke, so anything derived from its current contents compares
         * this keystroke with the last one and says "edited" for a document
         * that has been typed into and put back exactly as it was. Undo
         * gives back the same bytes and therefore the same hash.
         */
        edited: sha256 !== stored.originalSha256,
        sha256,
        state: next.trim() === "" ? "empty" : "ready",
      });
    });
    if (sourceFormat !== undefined) {
      propose(docId, proposeChecks(next, sourceFormat));
      /*
       * The bibliography is read again over the text as it now stands. It has
       * to be: the entry the person has just deleted is gone, the duplicate key
       * they have just renamed is not a duplicate any more, and the map of
       * where the entries sit is what a finding naming a key is shown against.
       * A reading that failed leaves both empty, which is the same as saying
       * "we no longer know", and that is the honest answer while the file is
       * mid-edit and does not parse.
       */
      if (hasStructure(sourceFormat)) {
        void readStructureOf({ text: next, format: sourceFormat }).then(
          (reading) => {
            setBibEntries(docId, reading.bibEntries);
            setLocalFindings(docId, reading.localFindings);
          },
          () => {
            setBibEntries(docId, []);
            setLocalFindings(docId, []);
          },
        );
      }
    }
  }, [docId, patchExtract, propose, setLocalFindings, sourceFormat]);

  /**
   * The edit is applied to the buffer itself, not to a copy made for viewing:
   * what leaves for the server is this text. There is no "changed but not
   * saved" state in the product - "Done" closes the overlay, it does not
   * confirm anything.
   */
  const onChange = React.useCallback(
    (next: string) => {
      if (replaceText(docId, next) === undefined) return;
      owed.current = next;
      if (pending.current !== null) clearTimeout(pending.current);
      pending.current = setTimeout(() => settle(), RECOMPUTE_DELAY_MS);
    },
    [docId, settle],
  );

  /**
   * What each edit moved, kept beside the text. It is what lets an answer that
   * describes the document as it was sent be applied to the document as it now
   * is, without the whole list being recomputed on every keystroke - and no
   * check is started by any of it: correcting the text changes only what will
   * be downloaded.
   */
  const onEdits = React.useCallback(
    (edits: readonly TextEdit[]) => {
      recordEdits(docId, edits);
      moveManualPlaces(docId, edits);
    },
    [docId],
  );

  /*
   * Closing within the delay above must not throw the last keystrokes' figures
   * away. The text itself is safe - the registry is written on every keystroke -
   * but the hash is what the results screen compares to say "this text has
   * changed since the check ran", so a dropped recount is that warning silently
   * failing to appear for exactly the edits made last. The cleanup finishes the
   * work rather than cancelling it, and reads the current one out of a ref so
   * that it runs on unmount alone.
   */
  const settleRef = React.useRef(settle);
  React.useEffect(() => {
    settleRef.current = settle;
  }, [settle]);
  React.useEffect(() => () => settleRef.current(), []);

  /** Scrolls to a place, lights it up, and puts the caret in it. */
  const goTo = React.useCallback((place: FindingPlace) => {
    const created = editor.current;
    const range = place.place.range;
    if (created === null || range === undefined) return;
    const from = Math.min(range.from, created.state.doc.length);
    const to = Math.min(range.to, created.state.doc.length);
    created.dispatch({
      selection: { anchor: from, head: to },
      effects: [
        setActiveFinding.of(place.key),
        EditorView.scrollIntoView(from, { y: "center" }),
      ],
    });
  }, []);

  /*
   * Which finding is being read. Chosen by a press on a row, on a highlight or
   * on a marked paragraph - and, until anything has been pressed, by what the
   * overlay was opened on: a press on "Show in text" over on the results names
   * a place, and the text opens standing on it. It is derived rather than
   * written into state on arrival, so there is no render in which the overlay
   * is open on nothing and then jumps.
   */
  const selected = chosen === "closed" ? null : (chosen ?? findingAt(findings, focus));

  const select = React.useCallback(
    (selection: PanelSelection) => setChosen(selection),
    [],
  );
  /*
   * Closing a finding closes the card and nothing else. The highlights stay in
   * the text, the list beside it keeps every row, and the counter goes back to
   * saying how many there are: what has been put away is the one thing that was
   * standing in the manuscript.
   */
  const close = React.useCallback(() => setChosen("closed"), []);

  /*
   * Which findings are in play, and how they are stepped through. Both live
   * here rather than in the list, because the current finding is the screen's
   * and not the list's: the same one is open in the card under its line, is
   * pinned to the bottom of a phone, and is the one the arrows move away from.
   */
  const fixed = useJobStore((state) => state.fixed);
  const ignored = useJobStore((state) => state.ignored);
  const [hideSettled, setHideSettled] = React.useState(false);
  const listed = React.useMemo(
    () =>
      hideSettled
        ? findings.filter(
            (finding) =>
              fixed[finding.issueKey] !== true && ignored[finding.issueKey] !== true,
          )
        : findings,
    [findings, hideSettled, fixed, ignored],
  );

  const step = React.useCallback(
    (by: number): void => {
      if (listed.length === 0) return;
      const at = listed.findIndex((finding) => finding.issueKey === selected?.issueKey);
      const next = listed[(at + by + listed.length * 2) % listed.length] ?? listed[0];
      if (next !== undefined) select({ issueKey: next.issueKey, at: 0 });
    },
    [listed, selected, select],
  );

  /**
   * Which of them is open, counted from one, or nothing while none is. It is
   * counted over the list as it is shown rather than over all of them, so that
   * "3 of 20" and the row the arrows land on are the same 3 and the same 20
   * while the settled ones are hidden.
   */
  const position = React.useMemo(() => {
    if (selected === null) return null;
    const at = listed.findIndex((finding) => finding.issueKey === selected.issueKey);
    return at === -1 ? null : at + 1;
  }, [listed, selected]);

  /*
   * One walk of the document for the whole screen, however many findings point
   * into it: on a dissertation this question is asked a thousand times over the
   * same three million characters, and both the list and the card under the
   * line ask it.
   */
  const starts = React.useMemo(() => lineStarts(settledText), [settledText]);

  /*
   * The highlights, handed to the editor whenever the places or the marks
   * change. They are put in place once and then move with the text on their own
   * - an insertion above them shifts them, an edit across one takes it off -
   * so this runs when an answer lands or a pass finishes, not while typing.
   */
  const marks = useMarks(findings);
  React.useEffect(() => {
    const created = editor.current;
    if (created === null) return;
    created.dispatch({ effects: setFindings.of(marks) });
  }, [marks]);

  /*
   * And the editor is told which one it is: scrolled to, lit up, and with the
   * caret put in it, because in an open finding the next thing to do is correct
   * the text. This is the one direction the state travels here - React holds
   * which finding is current, the editor is an external thing that is told.
   */
  const current =
    selected === null
      ? undefined
      : findings.find((entry) => entry.issueKey === selected.issueKey)?.places[
          selected.at
        ];
  React.useEffect(() => {
    if (current !== undefined) {
      goTo(current);
      return;
    }
    // And the ring comes off with the card. It marks the fragment being read,
    // so a finding that has been put away must not leave one standing in the
    // text over a place nothing is open on.
    editor.current?.dispatch({ effects: setActiveFinding.of(null) });
  }, [current, goTo]);

  /** The finding the card belongs to, and where in the text it stands. */
  const openFinding =
    selected === null
      ? undefined
      : findings.find((entry) => entry.issueKey === selected.issueKey);

  /*
   * The card of the open finding takes one of two forms, and the width decides
   * which. On a wide screen it is a block the editor places under the line, so
   * that what is said about a sentence is said next to the sentence. On a phone
   * it is pinned to the bottom of the overlay instead: a block dropped into a
   * column that narrow would push the very line it is about off the screen, and
   * the highlights above it stay visible while the arrows switch it.
   */
  const narrow = useNarrowScreen();
  const host = React.useMemo(
    () => (typeof document === "undefined" ? null : createCardHost()),
    [],
  );
  /*
   * How much of the text the pinned card is standing on. It is measured rather
   * than assumed because the card is as tall as what it has to say, and the
   * text is given exactly that much room at its end: otherwise the last lines
   * of a manuscript can be scrolled to and never seen, because where they
   * arrive is where the card is.
   */
  const pinned = React.useCallback((node: HTMLElement | null) => {
    const host = node?.parentElement;
    if (node === null || host === null || host === undefined) return;
    const measure = () => {
      host.style.setProperty(
        "--pinned-card",
        `${Math.round(node.getBoundingClientRect().height)}px`,
      );
    };
    // It is measured while it stands there rather than watched from a state:
    // the panel comes and goes with the width and grows with what the card has
    // to say, and the room under the text has to follow both.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => {
      observer.disconnect();
      host.style.removeProperty("--pinned-card");
    };
  }, []);

  const anchorOf = (place: FindingPlace): number | null =>
    place.place.range?.from ?? place.place.anchor ?? null;
  const inText =
    narrow || host === null || current === undefined || openFinding === undefined
      ? null
      : anchorOf(current) === null
        ? null
        : { key: current.key, at: anchorOf(current) ?? 0, host };

  React.useEffect(() => {
    const created = editor.current;
    if (created === null) return;
    created.dispatch({ effects: setInlineCard.of(inText) });
    // The card is one object built per render, and only what is in it decides
    // where the block goes: rebuilding the effect because the object is new
    // would take the card down and put it back up on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inText?.key, inText?.at, inText?.host]);

  /**
   * The keyboard following the person into the card they have just chosen, and
   * it is what makes the index beside the text usable without a mouse.
   *
   * The buttons of a finding - put this replacement in, mark it dealt with,
   * copy what was offered - are on the card and the card alone, and the card
   * stands inside the editor's own content. Nothing in a tab order leads there
   * from a list standing beside it. So pressing a row is taken to mean "take me
   * to this one", and the focus goes with the reader; the card's shortcuts are
   * bound to the card, so from that moment the arrows, `f` and `c` all work
   * where the hand already is.
   *
   * A press is the only thing that moves the focus. Stepping with the arrows
   * leaves it where it was, because somebody walking the index is reading the
   * index and would lose their place in it.
   */
  const [handOver, setHandOver] = React.useState(0);
  const handOverToCard = React.useCallback(() => setHandOver((n) => n + 1), []);
  React.useEffect(() => {
    if (handOver === 0 || host === null) return;
    host.querySelector<HTMLElement>("[data-testid='finding-card']")?.focus();
  }, [handOver, host]);

  const extensions = React.useMemo(
    () => [
      ...findingHighlights((key) => openByPlaceKey(findings, key, select)),
      ...inlineCards(),
    ],
    [findings, select],
  );

  const searchPhrases = useSearchPhrases();

  /*
   * What this document may be handed back as, the format it came in first. The
   * list is worked out from the document rather than being one list for the
   * product, so a menu appears only where there is a genuine choice - and for a
   * text extracted from a PDF, where there is not, the button simply saves.
   */
  const formats = React.useMemo(
    () => (item === undefined ? [] : downloadFormatsOf(item.sourceFormat, item.detected)),
    [item],
  );
  const name = item?.name ?? "";
  const save = React.useCallback(
    async (extension: string): Promise<void> => {
      await downloadDocumentText(docId, name, extension);
    },
    [docId, name],
  );

  if (item === undefined) return null;

  /** Puts the module's replacement into the text, as an ordinary edit. */
  const apply = (finding: PanelFinding, place: FindingPlace): void => {
    const created = editor.current;
    const range = place.place.range;
    if (created === null || range === undefined || finding.replacement === undefined) {
      return;
    }
    created.dispatch({
      changes: {
        from: Math.min(range.from, created.state.doc.length),
        to: Math.min(range.to, created.state.doc.length),
        insert: finding.replacement.value,
      },
    });
  };

  /** Takes the fragment the person has selected as the place of a finding. */
  const anchorHere = (key: string): void => {
    const created = editor.current;
    if (created === null) return;
    const { from, to } = created.state.selection.main;
    setManualPlace(key, {
      status: "manual",
      docId,
      anchor: asDocOffset(from),
      range: { from: asDocOffset(from), to: asDocOffset(to) },
      quote: created.state.doc.sliceString(from, to),
    });
    setPointingAt(null);
  };

  /**
   * The open finding's card, built once for both of the places it is shown.
   * Two elements with one set of actions between them would be two cards, and
   * two cards come apart at the first correction made to either.
   */
  const card =
    openFinding === undefined || selected === null ? null : (
      <FindingCard
        finding={openFinding}
        at={selected.at}
        starts={starts}
        pages={content?.pages}
        settled={
          fixed[openFinding.issueKey] === true || ignored[openFinding.issueKey] === true
        }
        onSelect={select}
        onClose={close}
        onStep={step}
        onApply={apply}
        pointingAt={pointingAt}
        onStartPointing={setPointingAt}
        onStopPointing={() => setPointingAt(null)}
        onAnchorHere={anchorHere}
        onClearManual={clearManualPlace}
      />
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        /*
         * On a phone the overlay is the whole screen, with a way back, and it
         * is sized and placed against the visual viewport rather than the
         * window: otherwise the keyboard covers the button that closes it, and
         * the panel is centred in a window the keyboard is standing on, which
         * walks the top of the editor down the screen and takes the lines above
         * the cursor with it. On anything wider it leaves only 0.5rem above and
         * below, maximising the text that stays visible while retaining the
         * editor's established width.
         *
         * The side margins are halved on a phone. There is no page behind the
         * overlay to separate the field from - it is the whole screen - and the
         * width the margins take is width the line does not get, which on a
         * manuscript is the difference between a line that wraps and one that
         * does not.
         *
         * With findings to show it is wider: the list stands beside the text
         * rather than under it, and the text keeps the measure it had.
         */
        style={frame}
        className={cn(
          "flex h-[var(--overlay-height)] max-w-none flex-col gap-3 rounded-none px-2 py-4 sm:h-[calc(var(--overlay-height)-1rem)] sm:rounded-lg sm:px-4",
          findings.length > 0 ? "sm:max-w-6xl" : "sm:max-w-4xl",
        )}
      >
        {/*
         * Two lines of head, and which words go on which is decided by width
         * rather than by kind. The first carries what the overlay is - the name
         * of the document - and the two ways out of it. The second is a rail:
         * the measurement at one end and the switches at the other, both of
         * them things about how the text is shown rather than what it is.
         *
         * The measurement used to sit under the name, in a column the buttons
         * had already narrowed to less than half the screen, so on a phone it
         * wrapped onto a third line and the manuscript lost that line. Here it
         * has the whole width the switches leave, which is more than it needs.
         */}
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="min-w-0 flex-1 truncate font-mono text-base">
            {item.name}
          </DialogTitle>
          {/* The text is downloaded from the place the person is reading it, in
              the format it was brought in. This is the bridge between one check
              and the next: correct the text here, save the file, drop it into a
              new check. */}
          <div className="flex shrink-0 items-center gap-2">
            <DownloadMenu formats={formats} onDownload={save} />
            {/* The one action that closes the overlay, so it is the primary
                button - the same weight as Download report on the results,
                which is the other place a screen has a single obvious way
                onward. */}
            <Button type="button" size="sm" onClick={onClose}>
              {t("done")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* The measurement is monospaced and the sentence is not: the rule is
              that a quantity or an identifier is set in the mono face, not that
              everything small is. */}
          <DialogDescription className="me-auto font-mono text-xs">
            {t("volume", { chars, words: item.extract.words })}
          </DialogDescription>
          {/* Which finding is open and the arrows that walk them, in the row of
              controls rather than at the head of the list beside the text. It
              is the only place they can be on both widths: there is no list
              beside the text on a phone, and the arrows are how the card pinned
              to the bottom of a phone is switched. */}
          {findings.length > 0 ? (
            <FindingsToolbar
              count={findings.length}
              position={position}
              hideSettled={hideSettled}
              onHideSettled={setHideSettled}
              onStep={step}
            />
          ) : null}
          {shown === "preview" ? (
            <PageFaceSwitch face={pageFace} onChange={setPageFace} />
          ) : (
            <FaceSwitch face={face} onChange={setFace} />
          )}
          {previewable ? <ViewSwitch view={shown} onChange={setView} /> : null}
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
            {/* Hidden rather than unmounted while the preview is up. The editor
                owns the document once it has been handed one, and taking it down
                would take the undo history and the cursor with it - so a person
                who looked at their page and came back would find their last ten
                corrections no longer undoable. */}
            <CodeMirror
              value={initial}
              language={language}
              face={face}
              phrases={searchPhrases}
              onChange={onChange}
              onEdits={onEdits}
              onReady={(created) => {
                editor.current = created;
                if (created === null) return;
                // A rebuilt editor starts empty of both, and neither the marks
                // nor the open card would arrive on their own: the effects that
                // send them watch what they hold, and nothing about them
                // changed when the editor underneath was replaced.
                if (marks.length > 0) {
                  created.dispatch({ effects: setFindings.of(marks) });
                }
                if (inText !== null) {
                  created.dispatch({ effects: setInlineCard.of(inText) });
                }
              }}
              extensions={extensions}
              ariaLabel={t("fieldLabel", { name: item.name })}
              className={cn("h-full overflow-auto", shown === "preview" && "hidden")}
            />
            {/* Read out of the registry here rather than taken from what the
                editor was opened with: the page shows the document as it stands
                now, including everything typed since it was opened. */}
            {shown === "preview" ? (
              <MarkdownPreview
                text={docRegistry.get(docId)?.text ?? ""}
                label={t("previewLabel", { name: item.name })}
                loadingLabel={t("previewLoading")}
                face={pageFace}
                findings={findings}
                onOpenFinding={(issueKey) => {
                  // The preview draws a document and marks a paragraph; the
                  // exact fragment lives in the source, so the press goes there.
                  setView("code");
                  select({ issueKey, at: 0 });
                }}
              />
            ) : null}
          </div>

          {findings.length > 0 ? (
            <FindingsPanel
              className="hidden shrink-0 sm:flex sm:h-auto sm:w-[21rem]"
              findings={findings}
              shown={listed}
              starts={starts}
              pages={content?.pages}
              selected={selected}
              onSelect={select}
              onOpen={handOverToCard}
            />
          ) : null}

          {/* The card of the open finding, drawn once and shown wherever this
              screen puts it: into the block the editor holds open under the
              line on a wide screen, and into the panel pinned to the foot of
              the text on a phone. One card, so a correction made to it is made
              to both.

              It stands over the text rather than beside it, and that is the
              whole of what makes a phone work here: a panel that took its
              height out of the layout would take it from the manuscript, and
              the person would be left reading their thesis through a slot. It
              floats instead - the field keeps its full height, the card covers
              its last lines, and scrolling brings them back out from under it.
              Its own height is whatever the card needs, up to half the screen,
              beyond which it scrolls inside itself. */}
          {findings.length > 0 && narrow ? (
            <section
              ref={pinned}
              aria-label={t("findings.label")}
              className="absolute inset-x-0 bottom-0 z-10 max-h-[50%] overflow-y-auto rounded-lg border bg-card shadow-lg sm:hidden"
              data-testid="pinned-finding"
            >
              {openFinding === undefined || selected === null ? (
                <p className="px-2.5 py-3 text-[0.8125rem] text-muted-foreground">
                  {listed.length === 0 ? t("findings.none") : t("findings.pick")}
                </p>
              ) : (
                card
              )}
            </section>
          ) : null}
        </div>

        {card === null || host === null || narrow ? null : createPortal(card, host)}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The finding a place belongs to, for the overlay opened on one from the
 * results. Nothing is selected when the answer it belongs to has not been
 * resolved yet, and the list simply arrives a moment later with it selected.
 */
function findingAt(
  findings: readonly PanelFinding[],
  key: string | undefined,
): PanelSelection | null {
  if (key === undefined) return null;
  for (const finding of findings) {
    const at = finding.places.findIndex((place) => place.key === key);
    if (at !== -1) return { issueKey: finding.issueKey, at };
  }
  return null;
}

/** Finds which row a highlight belongs to, and selects it. */
function openByPlaceKey(
  findings: readonly PanelFinding[],
  key: string,
  select: (selection: PanelSelection) => void,
): void {
  for (const finding of findings) {
    const at = finding.places.findIndex((place) => place.key === key);
    if (at !== -1) {
      select({ issueKey: finding.issueKey, at });
      return;
    }
  }
}

/**
 * What the editor is asked to highlight: every place of every finding in this
 * document, with the severity that decides its colour and whether the person
 * has already settled it.
 */
function useMarks(findings: readonly PanelFinding[]): readonly EditorFinding[] {
  // Dealt with and turned down are drawn the same way here - quietly - so the
  // two are read as one question and the highlights are rebuilt once for both.
  const fixed = useJobStore((state) => state.fixed);
  const ignored = useJobStore((state) => state.ignored);
  return React.useMemo(
    () =>
      findings.flatMap((finding) =>
        finding.places.flatMap((place) =>
          place.place.range === undefined || place.place.edited === true
            ? []
            : [
                {
                  key: place.key,
                  from: place.place.range.from,
                  to: place.place.range.to,
                  severity: finding.severity,
                  settled:
                    fixed[finding.issueKey] === true ||
                    ignored[finding.issueKey] === true,
                },
              ],
        ),
      ),
    [findings, fixed, ignored],
  );
}

/**
 * The two ways of looking at a markdown document: the source it is stored as,
 * and the page it draws.
 *
 * "Code" rather than "Edit", in every mode. The source is the document's own
 * text with its markup showing, and it is editable whether a check has run or
 * not; what only draws is the page, which is a rendering rather than the
 * document.
 *
 * The two are positions of one switch rather than two things to do, so they are
 * drawn as one: a track with the chosen position sitting on it, the same
 * control the light and dark switch in the header is. Standing apart as two
 * buttons they read as two actions, and which of them is a state has to be
 * worked out from the fills.
 */
function ViewSwitch({
  view,
  onChange,
}: {
  readonly view: "code" | "preview";
  readonly onChange: (view: "code" | "preview") => void;
}) {
  const t = useTranslations("editor");

  return (
    <Segmented
      compact
      label={t("view.label")}
      value={view}
      onChange={onChange}
      options={[
        {
          value: "code",
          label: t("view.code"),
          Icon: FileCodeIcon,
          testId: "view-code",
        },
        {
          value: "preview",
          label: t("view.preview"),
          Icon: FileTextIcon,
          testId: "view-preview",
        },
      ]}
    />
  );
}

/**
 * Which face the text is set in. Two exclusive positions, so it is the same
 * segmented control as everything else of that shape here rather than a pair of
 * buttons that would read as two actions.
 */
function FaceSwitch({
  face,
  onChange,
}: {
  readonly face: EditorFace;
  readonly onChange: (face: EditorFace) => void;
}) {
  const t = useTranslations("editor");

  return (
    <Segmented
      compact
      label={t("face.label")}
      value={face}
      onChange={onChange}
      options={[
        { value: "mono", label: t("face.mono"), Icon: CodeIcon, testId: "face-mono" },
        { value: "prose", label: t("face.prose"), Icon: TypeIcon, testId: "face-prose" },
      ]}
    />
  );
}

/**
 * Which face the drawn page is set in. The same control in the same place as
 * the one above, because it answers the same kind of question about the same
 * text; what changes with the view is which two faces are worth offering. On
 * the page a monospaced position would say nothing - there is no column in a
 * drawn document to line up - so the two positions are the face a manuscript is
 * printed in and the face the rest of the screen is set in.
 */
function PageFaceSwitch({
  face,
  onChange,
}: {
  readonly face: PageFace;
  readonly onChange: (face: PageFace) => void;
}) {
  const t = useTranslations("editor");

  return (
    <Segmented
      compact
      label={t("face.label")}
      value={face}
      onChange={onChange}
      options={[
        {
          value: "serif",
          label: t("face.serif"),
          Icon: BookOpenIcon,
          testId: "page-serif",
        },
        { value: "sans", label: t("face.prose"), Icon: TypeIcon, testId: "page-sans" },
      ]}
    />
  );
}

/**
 * The words the editor's own search panel uses. It is the library's markup and
 * it carries English inside it; these come out of the dictionary like every
 * other word on the screen, so the panel speaks the language being read.
 */
function useSearchPhrases(): Readonly<Record<string, string>> {
  const t = useTranslations("editor.search");
  return React.useMemo(
    () => ({
      Find: t("find"),
      next: t("next"),
      previous: t("previous"),
      all: t("all"),
      "match case": t("matchCase"),
      "by word": t("byWord"),
      regexp: t("regexp"),
      replace: t("replace"),
      "replace all": t("replaceAll"),
      close: t("close"),
      "current match": t("currentMatch"),
      "on line": t("onLine"),
      "go to line": t("goToLine"),
      go: t("go"),
    }),
    [t],
  );
}
