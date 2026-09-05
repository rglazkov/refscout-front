"use client";

import * as React from "react";
import { EditorView } from "@codemirror/view";
import { CodeIcon, DownloadIcon, FileTextIcon, LoaderIcon, TypeIcon } from "lucide-react";
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
  countWords,
  downloadExtensionOf,
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
import {
  findingHighlights,
  setActiveFinding,
  setFindings,
  type EditorFinding,
} from "./findings";
import { panelFindings, type FindingPlace, type PanelFinding } from "./findings-model";
import { FindingsPanel, type PanelSelection } from "./findings-panel";
import { MarkdownPreview } from "./preview";
import { syntaxKindOf, useSyntax } from "./syntax";
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
  const [chosen, setChosen] = React.useState<PanelSelection | null>(null);
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
  const selected = chosen ?? findingAt(findings, focus);

  const select = React.useCallback(
    (selection: PanelSelection) => setChosen(selection),
    [],
  );

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
    if (current !== undefined) goTo(current);
  }, [current, goTo]);

  const extensions = React.useMemo(
    () => findingHighlights((key) => openByPlaceKey(findings, key, select)),
    [findings, select],
  );

  const searchPhrases = useSearchPhrases();

  if (item === undefined) return null;

  const extension = downloadExtensionOf(item.sourceFormat);

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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate font-mono text-base">
              {item.name}
            </DialogTitle>
            {/* The measurement is monospaced and the sentence is not: the rule
                is that a quantity or an identifier is set in the mono face, not
                that everything small is. */}
            <DialogDescription className="font-mono text-xs">
              {t("volume", { chars, words: item.extract.words })}
            </DialogDescription>
          </div>
          {/* The text is downloaded from the place the person is reading it, in
              the format it was brought in. This is the bridge between one check
              and the next: correct the text here, save the file, drop it into a
              new check. */}
          <div className="flex shrink-0 items-start gap-2">
            <SaveButton docId={docId} name={item.name} extension={extension} />
            {/* The one action that closes the overlay, so it is the primary
                button - the same weight as Download report on the results,
                which is the other place a screen has a single obvious way
                onward. */}
            <Button type="button" size="sm" onClick={onClose}>
              {t("done")}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <FaceSwitch face={face} onChange={setFace} />
          {previewable ? <ViewSwitch view={shown} onChange={setView} /> : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
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
                if (created !== null && marks.length > 0) {
                  created.dispatch({ effects: setFindings.of(marks) });
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
                findings={findings}
                onOpenFinding={(issueKey) => {
                  // The preview draws a document and marks a paragraph; the
                  // exact fragment lives in the source, so the press goes there.
                  setView("code");
                  select({ issueKey, at: 0 });
                }}
                note={item.sourceFormat === "docx" ? t("previewNote") : undefined}
              />
            ) : null}
          </div>

          {findings.length > 0 ? (
            <FindingsPanel
              className="h-2/5 shrink-0 sm:h-auto sm:w-[21rem]"
              findings={findings}
              text={settledText}
              pages={content?.pages}
              selected={selected}
              onSelect={select}
              onApply={apply}
              pointingAt={pointingAt}
              onStartPointing={setPointingAt}
              onStopPointing={() => setPointingAt(null)}
              onAnchorHere={anchorHere}
              onClearManual={clearManualPlace}
            />
          ) : null}
        </div>
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
      label={t("view.label")}
      value={view}
      onChange={onChange}
      options={[
        { value: "code", label: t("view.code"), Icon: CodeIcon, testId: "view-code" },
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

/**
 * Saving the text as a file. It is a component of its own because one format
 * takes time: a Word file is built again out of the markdown, in a worker, and
 * a hundred pages of it is a second or two in which the button has to say that
 * something is happening. Every other format is a string handed to the browser
 * and is over before the next frame.
 *
 * The button is never disabled - no button in this product is. While it is
 * working it says so, and a second press during that time is ignored rather
 * than queued: two presses mean one file, and the person meant the first.
 */
function SaveButton({
  docId,
  name,
  extension,
}: {
  readonly docId: string;
  readonly name: string;
  readonly extension: string;
}) {
  const t = useTranslations("editor");
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const save = (): void => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    void downloadDocumentText(docId, name, extension).then(
      () => setSaving(false),
      () => {
        setSaving(false);
        setFailed(true);
      },
    );
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="download-document"
        aria-busy={saving}
        onClick={save}
      >
        {saving ? (
          <LoaderIcon className="animate-spin" aria-hidden="true" />
        ) : (
          <DownloadIcon aria-hidden="true" />
        )}
        {t("download", { extension })}
      </Button>
      {/* Said where the person presses, not in a help page. A Word file is built
          again out of the text, so the layout of the original and its pictures
          are not in it - and somebody who brought a typeset manuscript would
          otherwise find that out by opening what they had just saved. */}
      {extension === "docx" && !failed ? (
        <p className="max-w-64 text-right text-xs text-muted-foreground">
          {t("docxNote")}
        </p>
      ) : null}
      {/* A build that failed says so where it was asked for, and stays there.
          The text itself is untouched and is still in front of the person -
          what did not work is the packing of it into a container. */}
      {failed ? (
        <p role="alert" className="max-w-64 text-right text-xs text-destructive">
          {t("downloadFailed")}
        </p>
      ) : null}
    </div>
  );
}
