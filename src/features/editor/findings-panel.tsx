"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { lineAt, pageOf } from "@/lib/docs";
import { cn } from "@/lib/cn";
import { type Counts, type PageSpan } from "@/lib/domain";
import { useWording } from "@/lib/i18n";
import { useJobStore } from "@/stores";

import { SeverityDots } from "../results/severity-dots";

import { HEADLINE_LAYOUT, Headline } from "./finding-card";
import { type PanelFinding, type PanelRow, type PanelSelection } from "./findings-model";

/**
 * The findings of the open document, indexed beside it.
 *
 * It is an index and only an index: a row per finding saying what it is, how
 * bad it is and where in the document it falls. The finding itself - the quote,
 * the replacement, the buttons that put it into the text or mark it dealt with
 * - is the card standing under the line, and it is there and nowhere else.
 * There is one card open at a time and one place it is drawn, so what is on the
 * screen is a list to find things in and a card to work in, rather than the
 * same finding written out twice a hand's width apart.
 *
 * The list is what makes a hundred findings countable and walkable. Pressing a
 * row scrolls the text to the place, lights it up, opens the card under the
 * line and hands the keyboard to that card - which is the whole path from
 * "which of these hundred" to "do something about this one", and it is a path a
 * hand on a keyboard can walk as well as a hand on a mouse.
 */
export function FindingsPanel({
  findings,
  shown,
  counts,
  unplaced,
  starts,
  pages,
  selected,
  onSelect,
  onOpen,
  className,
}: {
  /** Every finding of this document, which is what the row count is drawn from. */
  readonly findings: readonly PanelFinding[];
  /** The ones the filter leaves: what the list draws and the arrows walk. */
  readonly shown: readonly PanelRow[];
  /** The findings in this text by severity, counted as the results screen counts. */
  readonly counts: Counts;
  /** How many findings about this document have no place in its text. */
  readonly unplaced: number;
  /** Where the lines of the live text begin, walked once for the whole screen. */
  readonly starts: readonly number[];
  readonly pages: readonly PageSpan[] | undefined;
  readonly selected: PanelSelection | null;
  readonly onSelect: (selection: PanelSelection) => void;
  /**
   * A row was pressed, which means the person wants the finding rather than the
   * next row down. The keyboard goes to the card with them.
   */
  readonly onOpen: () => void;
  readonly className?: string;
}) {
  const t = useTranslations("editor");
  const fixed = useJobStore((state) => state.fixed);
  const ignored = useJobStore((state) => state.ignored);

  return (
    <section
      aria-label={t("findings.label")}
      className={cn("flex min-h-0 flex-col rounded-lg border bg-card", className)}
      data-testid="findings-panel"
    >
      {/* What this list holds, counted the way the results screen counts: by
          finding and by severity, so the two screens can be compared at a
          glance. The rows underneath are one per place, which is a different
          quantity and says so - a work cited three times is one finding and
          three rows. */}
      <div className="border-b px-2.5 py-2" data-testid="findings-summary">
        <SeverityDots counts={counts} />
        {/* And what is not here. A finding the resolver could not place has no
            fragment to stand on and no row to stand in, and without this line
            the list would simply be shorter than the summary on the screen
            behind it with nothing to say why. */}
        {unplaced > 0 ? (
          <p
            className="mt-1 text-xs text-muted-foreground"
            data-testid="findings-unplaced"
          >
            {t("findings.unplaced", { count: unplaced })}
          </p>
        ) : null}
      </div>
      {shown.length === 0 ? (
        <p className="px-2.5 py-3 text-[0.8125rem] text-muted-foreground">
          {findings.length === 0
            ? t("findings.heading", { count: 0 })
            : t("findings.none")}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto [&>li]:[contain-intrinsic-size:auto_3rem] [&>li]:[content-visibility:auto]">
          {shown.map((row) => (
            <FindingRow
              key={`${row.finding.issueKey}:${row.at}`}
              finding={row.finding}
              at={row.at}
              starts={starts}
              pages={pages}
              settled={
                fixed[row.finding.issueKey] === true ||
                ignored[row.finding.issueKey] === true
              }
              current={
                selected?.issueKey === row.finding.issueKey && selected.at === row.at
              }
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One row of the index: the finding named, and the part of being in a list that
 * the row itself has no business knowing about - which row is on screen and
 * where the keyboard is.
 */
function FindingRow({
  finding,
  at,
  starts,
  pages,
  settled,
  current,
  onSelect,
  onOpen,
}: {
  readonly finding: PanelFinding;
  /** Which place of the finding this row stands for. */
  readonly at: number;
  readonly starts: readonly number[];
  readonly pages: readonly PageSpan[] | undefined;
  readonly settled: boolean;
  /** Whether this is the place whose card is open. */
  readonly current: boolean;
  readonly onSelect: (selection: PanelSelection) => void;
  readonly onOpen: () => void;
}) {
  const phrase = useWording();
  const row = React.useRef<HTMLLIElement>(null);
  const place = finding.places[at] ?? finding.places[0];
  const anchor = place?.place.anchor;

  /*
   * The row that has just become the current one has to be on screen, and the
   * keyboard has to arrive with it - otherwise the second press of an arrow
   * goes to the row that was left behind. The focus is only taken when it is
   * already inside this list: a finding chosen by pressing its highlight in the
   * text, or the arrows worked from the card under the line, must leave the
   * keyboard where the person put it.
   */
  React.useEffect(() => {
    const element = row.current;
    if (!current || element === null) return;
    element.scrollIntoView({ block: "nearest" });
    const panel = element.closest("[data-testid='findings-panel']");
    if (panel?.contains(document.activeElement) === true) {
      element.querySelector("button")?.focus();
    }
  }, [current, at]);

  return (
    <li
      ref={row}
      className={cn("border-b last:border-b-0", current && "bg-accent-bg")}
      data-testid="panel-finding"
    >
      {/* `aria-current` for the row whose card is open, and nothing that
          promises to expand: a row has nothing to unfold, and the press takes
          the reader to the card standing in the text, which is where this
          finding is read and acted on. */}
      <button
        type="button"
        aria-current={current ? "true" : undefined}
        className={cn(HEADLINE_LAYOUT, "transition-colors hover:bg-accent-bg")}
        onClick={() => {
          onSelect({ issueKey: finding.issueKey, at });
          onOpen();
        }}
      >
        <Headline
          compact
          finding={finding}
          at={at}
          line={anchor === undefined ? null : lineAt(starts, anchor)}
          page={anchor === undefined ? null : pageOf(pages, anchor)}
          title={phrase(finding.titleKey, finding.params, finding.code)}
          settled={settled}
        />
      </button>
    </li>
  );
}
