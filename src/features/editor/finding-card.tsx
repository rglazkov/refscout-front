"use client";

import * as React from "react";
import {
  BanIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  CrosshairIcon,
  ReplaceIcon,
  XIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { lineAt, pageOf } from "@/lib/docs";
import { type PageSpan, type Place } from "@/lib/domain";
import { useWording } from "@/lib/i18n";
import { useJobStore } from "@/stores";

import { EvidenceList } from "@/features/results/details/evidence";

import {
  type FindingPlace,
  type PanelFinding,
  type PanelSelection,
} from "./findings-model";

/**
 * One finding, as the card the person acts on.
 *
 * There is exactly one of these in the product and it is drawn in two places:
 * as a row of the list beside the text, and as a block opened under the line it
 * belongs to. Both offer the same things - step to the next place, put the
 * module's replacement into the text, copy what it offered, mark the finding
 * dealt with or turned down, point at a place by hand - because they are the
 * same card and not two drawings of one. Two cards with one set of actions
 * would come apart at the first correction made to either.
 *
 * There is one of these on the screen at a time and one place it is drawn:
 * under the line the finding falls on. The list beside the text is an index - a
 * row per finding, saying what it is and where - and pressing a row is how one
 * is chosen; this is where it is read and acted on. That division is what keeps
 * the screen readable, and it is also what keeps the finding single: the same
 * three buttons, the same quote and the same place drawn twice a hand's width
 * apart are two cards, and two cards come apart at the first correction made to
 * either.
 */
export type FindingCardProps = {
  readonly finding: PanelFinding;
  /** Which of this finding's places is the current one. */
  readonly at: number;
  /** Where the lines of the live text begin, for the line a place falls on. */
  readonly starts: readonly number[];
  readonly pages: readonly PageSpan[] | undefined;
  /** Marked as dealt with or turned down: still shown, and shown quietly. */
  readonly settled: boolean;
  readonly onSelect: (selection: PanelSelection) => void;
  /** Puts the card away and leaves the text and its highlights standing. */
  readonly onClose: () => void;
  /** Walks the findings from wherever the keyboard is inside this card. */
  readonly onStep: (by: number) => void;
  readonly onApply: (finding: PanelFinding, place: FindingPlace) => void;
  /** The place the person is being asked to point at, if any. */
  readonly pointingAt: string | null;
  readonly onStartPointing: (key: string) => void;
  readonly onStopPointing: () => void;
  readonly onAnchorHere: (key: string) => void;
  readonly onClearManual: (key: string) => void;
};

/**
 * The card's shortcuts, put on the card itself rather than declared on it.
 *
 * They belong to the whole card, because the focus inside it can be on any of
 * its buttons and a keystroke has to mean the same thing wherever it is. Said
 * as a handler prop on the element, they would also be saying that the card is
 * a control, which it is not: it is a group of controls, and a group that
 * claims to be one is a group a screen reader announces wrongly.
 */
function useShortcuts(
  handle: (event: KeyboardEvent) => void,
): React.RefObject<HTMLDivElement | null> {
  const root = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const node = root.current;
    if (node === null) return;
    node.addEventListener("keydown", handle);
    return () => node.removeEventListener("keydown", handle);
  }, [handle]);
  return root;
}

export function FindingCard({
  finding,
  at,
  starts,
  pages,
  settled,
  onSelect,
  onClose,
  onStep,
  onApply,
  pointingAt,
  onStartPointing,
  onStopPointing,
  onAnchorHere,
  onClearManual,
}: FindingCardProps) {
  const t = useTranslations("editor");
  const results = useTranslations("results");
  const phrase = useWording();
  const toggleFixed = useJobStore((state) => state.toggleFixed);
  const toggleIgnored = useJobStore((state) => state.toggleIgnored);
  const marked = useJobStore((state) => state.fixed[finding.issueKey] === true);
  const ignored = useJobStore((state) => state.ignored[finding.issueKey] === true);

  /*
   * The whole list is walked from inside the card, because this is where
   * somebody proofing a hundred references keeps their hands, and the keys are
   * bound here rather than to the window: bound to the window, an "f" would
   * mark a finding dealt with while a person was typing one into their own
   * manuscript. In the text the card sits inside the field itself, and the
   * editor is told to leave the card's events alone for exactly this reason.
   */
  const shortcuts = React.useCallback(
    (event: KeyboardEvent): void => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onStep(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        onStep(-1);
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        toggleFixed(finding.docId, finding.module, finding.issueId);
      } else if (
        (event.key === "c" || event.key === "C") &&
        !event.ctrlKey &&
        !event.metaKey &&
        finding.copy !== undefined
      ) {
        event.preventDefault();
        void navigator.clipboard.writeText(finding.copy);
      }
    },
    [finding, onStep, toggleFixed],
  );
  const root = useShortcuts(shortcuts);

  const current = finding.places[at] ?? finding.places[0];
  if (current === undefined) return null;

  const line =
    current.place.anchor === undefined ? null : lineAt(starts, current.place.anchor);
  const page =
    current.place.anchor === undefined ? null : pageOf(pages, current.place.anchor);
  const pointing = pointingAt === current.key;
  const title = phrase(finding.titleKey, finding.params, finding.code);

  return (
    <div
      ref={root}
      role="group"
      aria-label={title}
      /* Focusable by script rather than in the tab order, and it is the one
         thing that makes the keyboard path work: pressing a row of the index
         hands the focus here, and from here the card's own buttons follow one
         another. In the tab order it would be a hundred extra stops between the
         text and the button that closes the overlay. */
      tabIndex={-1}
      data-testid="finding-card"
      className={cn(
        /* The card is filled in the colour of its severity, and it is the same
           fill the opened finding carries on the results: one severity scale,
           one panel, wherever a finding is read. Inside the text that fill is
           also the only thing that separates the card from the manuscript it is
           standing in - drawn on the field's own surface it is a paragraph of
           buttons in the middle of somebody's thesis. The bar down its edge is
           the same bar the highlight above it carries, so the card says which
           of the marks in the text opened it. */
        /* And it fixes its own face rather than inheriting the field's. The
           card is a box on its own surface standing inside the text, and what
           is on it is interface: a title, a sentence about the finding and a
           row of buttons. Left to inherit, all of that is set in whatever the
           manuscript is set in - a paragraph of controls in a monospaced
           column, which is neither what it is nor how it reads. The one thing
           on it that is the document keeps the document's face, and says so
           where it is written. */
        "my-1 max-w-[44rem] rounded-lg border border-s-[3px] font-sans shadow-xs",
        finding.severity === "critical" &&
          "border-critical-border border-s-critical bg-critical-soft",
        finding.severity === "warning" &&
          "border-warning-border border-s-warning bg-warning-soft",
        finding.severity === "info" && "border-border border-s-muted-foreground bg-muted",
        settled && "opacity-70",
      )}
    >
      <div className="flex items-start">
        <div className={cn(HEADLINE_LAYOUT, "min-w-0 flex-1")}>
          <Headline
            finding={finding}
            at={at}
            line={line}
            page={page}
            title={title}
            settled={marked || ignored}
          />
        </div>
        {/* The way out of a finding, in the corner of the thing being closed.
            A press on a fragment opens the card, and until there was one of
            these the only way back to an unencumbered text was to open another
            finding or to leave the document: the card stands in the text on a
            wide screen and over the last lines of it on a phone, so a finding
            somebody has finished reading was covering the manuscript with no
            way to say so. */}
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          className="me-1.5 mt-1.5 shrink-0"
          aria-label={t("findings.close")}
          data-testid="close-finding"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>

      {/* What the finding actually says, which is what this card is for. The
          row of the index beside the text names the finding and where it falls;
          everything that has to be read rather than scanned is here, under the
          line it is about: the module's own sentence, the fragment it judged,
          the text it offers to put there and the facts it found. */}
      <div className="space-y-2 px-2.5 pt-0.5 pb-2.5 text-[0.8125rem]">
        {/* Plain text from the module, placed as a text node and never as
            markup. */}
        {finding.detail === undefined ? null : <p>{finding.detail}</p>}

        {/* The fragment the module was looking at, quoted as it stood when the
            check ran. It is the third way of naming a place, and the one that
            still works in a document with no pages and no bibliography keys. */}
        {current.place.quote === undefined ? null : (
          <p
            /* Set in the serif, because it is a sentence out of the manuscript
               and the face is assigned by what the text is rather than by what
               is around it. The change of face lands together with a change of
               something else - the rule down its edge and the quieter ink - so
               it reads as "a different kind of thing" rather than as a slip. */
            className="border-s-2 ps-2.5 font-serif text-sm break-words text-muted-foreground"
            data-testid="finding-quote"
          >
            {current.place.quote}
          </p>
        )}

        {/* What the button beside it would put in the text, shown before it is
            pressed rather than after: applying it is an edit to somebody's
            manuscript, and an edit nobody could read first is one nobody can
            agree to. */}
        {finding.replacement !== undefined &&
        finding.replacement.at === current.ordinal &&
        current.place.range !== undefined ? (
          <p className="text-xs text-muted-foreground" data-testid="finding-replacement">
            {t("findings.offered")}{" "}
            <span className="font-mono break-words text-foreground">
              {finding.replacement.value}
            </span>
          </p>
        ) : null}

        <EvidenceList facts={finding.evidence} />

        <div className="flex flex-wrap gap-1.5">
          {finding.places.length > 1 ? (
            <Button
              type="button"
              size="xs"
              variant="outlineOnCard"
              data-testid="next-occurrence"
              onClick={() =>
                onSelect({
                  issueKey: finding.issueKey,
                  at: (at + 1) % finding.places.length,
                })
              }
            >
              <ChevronRightIcon aria-hidden="true" />
              {t("findings.nextOccurrence")}
            </Button>
          ) : null}

          {/* Offered only where the module sent the text to put there, and only
              at the place it named. It is not the same button as "Fixed": one
              says "I have dealt with this", the other changes the manuscript,
              and one button making both promises would be a mark that
              sometimes rewrites a thesis. */}
          {finding.replacement !== undefined &&
          finding.replacement.at === current.ordinal &&
          current.place.range !== undefined ? (
            <Button
              type="button"
              size="xs"
              variant="outlineOnCard"
              data-testid="apply-replacement"
              onClick={() => onApply(finding, current)}
            >
              <ReplaceIcon aria-hidden="true" />
              {t("apply")}
            </Button>
          ) : null}

          {finding.copy === undefined ? null : (
            <Button
              type="button"
              size="xs"
              variant="outlineOnCard"
              data-testid="copy-finding"
              onClick={() => void navigator.clipboard.writeText(finding.copy ?? "")}
            >
              <CopyIcon aria-hidden="true" />
              {results("copy")}
            </Button>
          )}

          <Button
            type="button"
            size="xs"
            variant={marked ? "secondary" : "outline"}
            aria-pressed={marked}
            data-testid="mark-fixed"
            onClick={() => toggleFixed(finding.docId, finding.module, finding.issueId)}
          >
            <CheckCheckIcon aria-hidden="true" />
            {results("fixed")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant={ignored ? "secondary" : "outline"}
            aria-pressed={ignored}
            data-testid="mark-ignored"
            onClick={() => toggleIgnored(finding.docId, finding.module, finding.issueId)}
          >
            <BanIcon aria-hidden="true" />
            {results("ignore")}
          </Button>

          {/* Pointing at it by hand. Nothing changes until it is confirmed, and
              what changes then is where the finding points - never what the
              finding says. */}
          {current.place.status === "manual" ? (
            <Button
              type="button"
              size="xs"
              variant="outline"
              data-testid="clear-manual-place"
              onClick={() => onClearManual(current.key)}
            >
              {t("place.removeManual")}
            </Button>
          ) : null}
          {current.place.status === "lost" || current.place.status === "manual" ? (
            <Button
              type="button"
              size="xs"
              variant={pointing ? "secondary" : "outline"}
              aria-pressed={pointing}
              data-testid="point-at-place"
              onClick={() => (pointing ? onStopPointing() : onStartPointing(current.key))}
            >
              <CrosshairIcon aria-hidden="true" />
              {current.place.status === "manual"
                ? t("place.changeManual")
                : t("place.point")}
            </Button>
          ) : null}

          {pointing ? (
            <p
              role="status"
              className="w-full rounded-md border border-dashed p-2 text-xs text-muted-foreground"
            >
              {t("place.pointHint")}{" "}
              <Button
                type="button"
                size="xs"
                variant="outlineOnCard"
                data-testid="anchor-here"
                onClick={() => onAnchorHere(current.key)}
              >
                {t("place.anchorHere")}
              </Button>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The layout of the headline, shared by the card and by the row of the index,
 * so that the row a person presses and the card that opens are the same two
 * lines in the same shape. It is written once here for the same reason the
 * headline itself is one component: the row is how a finding is recognised, and
 * two drawings of it drift.
 */
export const HEADLINE_LAYOUT =
  "grid w-full grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5 px-2.5 py-2 text-start text-[0.8125rem]";

/**
 * What a finding is called and where it falls: the dot of its severity, the
 * title the module gave it, the line and page it is on, which of its places
 * this is and what became of that place.
 *
 * It is drawn twice - as the head of the card and as the row of the index - and
 * that is the one thing in this file that genuinely is drawn twice. It is
 * allowed to be, because it is a label: a person finds a finding in the list by
 * the words it is named with, and finds it again on the card by the same words.
 * The body underneath is a different matter and is drawn once.
 */
export function Headline({
  finding,
  at,
  line,
  page,
  title,
  settled,
  compact = false,
}: {
  readonly finding: PanelFinding;
  readonly at: number;
  readonly line: number | null;
  readonly page: number | null;
  readonly title: string;
  /** Marked as dealt with or turned down, which strikes the title through. */
  readonly settled: boolean;
  /**
   * In the index rather than on the card, where the title is cut off after two
   * lines. The index is read by running down it, and a row that is five lines
   * tall because a module named a long work in its title pushes the next
   * findings off the screen; the whole of the sentence is on the card, which is
   * where the finding is read rather than found.
   */
  readonly compact?: boolean;
}) {
  const t = useTranslations("editor");
  const results = useTranslations("results");
  const format = useFormatter();
  const current = finding.places[at] ?? finding.places[0];

  return (
    <>
      <span
        className={cn(
          "row-span-2 mt-1.5 size-2 shrink-0 rounded-full",
          finding.severity === "critical" && "bg-critical",
          finding.severity === "warning" && "bg-warning",
          finding.severity === "info" && "bg-muted-foreground",
        )}
        aria-hidden="true"
      />
      <span
        className={cn("min-w-0", compact && "line-clamp-2", settled && "line-through")}
      >
        {title}
      </span>
      <span className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-muted-foreground">
        {line === null ? null : <span>{t("place.line", { line })}</span>}
        {page === null ? null : (
          <span>{results("place.pages", { pages: format.number(page), count: 1 })}</span>
        )}
        {finding.places.length > 1 ? (
          <span data-testid="occurrence">
            {t("findings.occurrence", { index: at + 1, count: finding.places.length })}
          </span>
        ) : null}
        {current === undefined ? null : <PlaceNote place={current.place} />}
      </span>
    </>
  );
}

/**
 * The controls that belong to the findings as a set rather than to any one of
 * them: which one of how many is open, whether the settled ones are shown, and
 * the two arrows that walk them.
 *
 * They stand in the editor's own row of controls, beside the switch between the
 * code and the page, and they stand there on every width. That is the whole
 * reason they are not at the head of the list beside the text: there is no list
 * beside the text on a phone, and the arrows are how the card pinned to the
 * bottom of a phone is switched - so a set of findings would have had no way to
 * be stepped through on the screen where stepping through them matters most.
 *
 * The arrows point up and down because that is the direction they move in. The
 * findings are in the order they occur in the document, the list beside the
 * text is a column, and the text itself is read downwards: an arrow pointing
 * right beside a column of findings promises a step sideways - to another
 * document, another check, another page - and delivers a step down.
 */
export function FindingsToolbar({
  count,
  position,
  hideSettled,
  onHideSettled,
  onStep,
}: {
  readonly count: number;
  /**
   * Which of them is open, counted from one, or nothing while none is. It is
   * shown in place of the total rather than beside it: "finding 3 of 20" says
   * the total as well, and two numbers for one fact is a row that has to be
   * read rather than glanced at.
   */
  readonly position: number | null;
  readonly hideSettled: boolean;
  readonly onHideSettled: (hide: boolean) => void;
  readonly onStep: (by: number) => void;
}) {
  const t = useTranslations("editor");

  return (
    <div className="flex items-center gap-1.5" data-testid="findings-toolbar">
      {/* The count is a quantity, so it is set in the mono face - the same rule
          that puts the length of the document there. */}
      <span className="font-mono text-[0.8125rem] whitespace-nowrap">
        {position === null
          ? t("findings.heading", { count })
          : t("findings.position", { index: position, count })}
      </span>
      {/* A filter and not a removal: it is switched off in one press and no
          mark is lost by it. */}
      <Button
        type="button"
        size="xs"
        variant={hideSettled ? "secondary" : "outline"}
        aria-pressed={hideSettled}
        data-testid="hide-settled"
        onClick={() => onHideSettled(!hideSettled)}
      >
        {t("findings.hideSettled")}
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        aria-label={t("findings.previous")}
        data-testid="previous-finding"
        onClick={() => onStep(-1)}
      >
        <ChevronUpIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        aria-label={t("findings.next")}
        data-testid="next-finding"
        onClick={() => onStep(1)}
      >
        <ChevronDownIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * What became of this place, said in words rather than implied by the presence
 * of a highlight. A highlight that quietly stands in the wrong paragraph is the
 * worst outcome the anchoring can produce, so every outcome but the ordinary
 * one is named: found by searching, worked out from the bibliography, pointed
 * at by hand, edited since the check read it, or not found at all.
 */
function PlaceNote({ place }: { readonly place: Place }) {
  const t = useTranslations("editor");
  if (place.edited === true) {
    return <span className="text-warning">{t("place.edited")}</span>;
  }
  switch (place.status) {
    /* The ordinary outcome, and the only one that says nothing: the
       coordinates held the text the module quoted. */
    case "exact":
    case "none":
      return null;
    case "relocated":
      return <span>{t("place.relocated")}</span>;
    case "derived":
      return <span>{t("place.derived")}</span>;
    case "manual":
      return <span>{t("place.manual")}</span>;
    case "lost":
      return (
        <span className="text-warning" data-testid="place-lost">
          {t("place.lost")}
        </span>
      );
  }
}
