"use client";

import * as React from "react";
import {
  BanIcon,
  CheckCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  CrosshairIcon,
  ReplaceIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { lineAt, lineStarts, pageOf } from "@/lib/docs";
import { type PageSpan, type Place } from "@/lib/domain";
import { useWording } from "@/lib/i18n";
import { useJobStore } from "@/stores";

import { type FindingPlace, type PanelFinding } from "./findings-model";

/**
 * The findings of the open document, listed beside it.
 *
 * Beside the text rather than inside it, and that is the whole shape of this
 * screen: a hundred findings drawn as a hundred blocks between the paragraphs
 * would be a document nobody can read. Pressing a row scrolls the text to the
 * place and lights it up; pressing the highlight in the text selects the row.
 * The two are one thing seen from two sides.
 *
 * The list is worked from the keyboard, because that is how somebody proofing a
 * hundred references works: the arrows step through the findings, F marks one
 * as dealt with, C copies what the module offered. Every one of them is also a
 * button, because a shortcut nobody was told about is not an interface.
 */
export type PanelSelection = {
  readonly issueKey: string;
  /** Which of this finding's places in this document is the current one. */
  readonly at: number;
};

export function FindingsPanel({
  findings,
  text,
  pages,
  selected,
  onSelect,
  onApply,
  pointingAt,
  onStartPointing,
  onStopPointing,
  onAnchorHere,
  onClearManual,
  className,
}: {
  readonly findings: readonly PanelFinding[];
  /** The document as it stands, for the line a place falls on. */
  readonly text: string;
  readonly pages: readonly PageSpan[] | undefined;
  readonly selected: PanelSelection | null;
  readonly onSelect: (selection: PanelSelection) => void;
  readonly onApply: (finding: PanelFinding, place: FindingPlace) => void;
  /** The place the person is being asked to point at, if any. */
  readonly pointingAt: string | null;
  readonly onStartPointing: (key: string) => void;
  readonly onStopPointing: () => void;
  readonly onAnchorHere: (key: string) => void;
  readonly onClearManual: (key: string) => void;
  readonly className?: string;
}) {
  const t = useTranslations("editor");
  const [hideSettled, setHideSettled] = React.useState(false);
  const fixed = useJobStore((state) => state.fixed);
  const ignored = useJobStore((state) => state.ignored);

  const settledOf = React.useCallback(
    (issueKey: string) => fixed[issueKey] === true || ignored[issueKey] === true,
    [fixed, ignored],
  );

  const shown = hideSettled
    ? findings.filter((finding) => !settledOf(finding.issueKey))
    : findings;

  // One walk of the document for the whole list, however many findings point
  // into it: on a dissertation this question is asked a thousand times over the
  // same three million characters.
  const starts = React.useMemo(() => lineStarts(text), [text]);

  const step = (by: number): void => {
    if (shown.length === 0) return;
    const at = shown.findIndex((finding) => finding.issueKey === selected?.issueKey);
    const next = shown[(at + by + shown.length * 2) % shown.length] ?? shown[0];
    if (next !== undefined) onSelect({ issueKey: next.issueKey, at: 0 });
  };

  return (
    <section
      aria-label={t("findings.label")}
      className={cn("flex min-h-0 flex-col rounded-lg border bg-card", className)}
      data-testid="findings-panel"
    >
      <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
        <h3 className="min-w-0 flex-1 truncate text-[0.8125rem] font-semibold">
          {t("findings.heading", { count: findings.length })}
        </h3>
        {/* A filter and not a removal: it is switched off in one press and no
            mark is lost by it. */}
        <Button
          type="button"
          size="xs"
          variant={hideSettled ? "secondary" : "outline"}
          aria-pressed={hideSettled}
          data-testid="hide-settled"
          onClick={() => setHideSettled(!hideSettled)}
        >
          {t("findings.hideSettled")}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          aria-label={t("findings.previous")}
          data-testid="previous-finding"
          onClick={() => step(-1)}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="xs"
          variant="outline"
          aria-label={t("findings.next")}
          data-testid="next-finding"
          onClick={() => step(1)}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>

      {shown.length === 0 ? (
        <p className="px-2.5 py-3 text-[0.8125rem] text-muted-foreground">
          {t("findings.none")}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto [&>li]:[contain-intrinsic-size:auto_3rem] [&>li]:[content-visibility:auto]">
          {shown.map((finding) => (
            <FindingRow
              key={finding.issueKey}
              finding={finding}
              starts={starts}
              pages={pages}
              settled={settledOf(finding.issueKey)}
              selected={selected?.issueKey === finding.issueKey ? selected.at : null}
              onSelect={onSelect}
              onStep={step}
              onApply={onApply}
              pointingAt={pointingAt}
              onStartPointing={onStartPointing}
              onStopPointing={onStopPointing}
              onAnchorHere={onAnchorHere}
              onClearManual={onClearManual}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function FindingRow({
  finding,
  starts,
  pages,
  settled,
  selected,
  onSelect,
  onStep,
  onApply,
  pointingAt,
  onStartPointing,
  onStopPointing,
  onAnchorHere,
  onClearManual,
}: {
  readonly finding: PanelFinding;
  readonly starts: readonly number[];
  readonly pages: readonly PageSpan[] | undefined;
  readonly settled: boolean;
  readonly selected: number | null;
  readonly onSelect: (selection: PanelSelection) => void;
  /** Walks the list from the row that has the focus. */
  readonly onStep: (by: number) => void;
  readonly onApply: (finding: PanelFinding, place: FindingPlace) => void;
  readonly pointingAt: string | null;
  readonly onStartPointing: (key: string) => void;
  readonly onStopPointing: () => void;
  readonly onAnchorHere: (key: string) => void;
  readonly onClearManual: (key: string) => void;
}) {
  const t = useTranslations("editor");
  const results = useTranslations("results");
  const format = useFormatter();
  const phrase = useWording();
  const row = React.useRef<HTMLLIElement>(null);
  const toggleFixed = useJobStore((state) => state.toggleFixed);
  const toggleIgnored = useJobStore((state) => state.toggleIgnored);
  const marked = useJobStore((state) => state.fixed[finding.issueKey] === true);
  const ignored = useJobStore((state) => state.ignored[finding.issueKey] === true);

  const at = selected ?? 0;
  const current = finding.places[at] ?? finding.places[0];
  const open = selected !== null;

  /*
   * The row that has just become the current one has to be on screen, and the
   * keyboard has to arrive with it - otherwise the second press of an arrow
   * goes to the row that was left behind. The focus is only taken when it is
   * already inside this list: selecting a finding by pressing its highlight in
   * the text must leave the caret where the person put it.
   */
  React.useEffect(() => {
    const element = row.current;
    if (!open || element === null) return;
    element.scrollIntoView({ block: "nearest" });
    const panel = element.closest("[data-testid='findings-panel']");
    if (panel?.contains(document.activeElement) === true) {
      element.querySelector("button")?.focus();
    }
  }, [open, at]);

  if (current === undefined) return null;

  const line =
    current.place.anchor === undefined ? null : lineAt(starts, current.place.anchor);
  const page =
    current.place.anchor === undefined ? null : pageOf(pages, current.place.anchor);
  const pointing = pointingAt === current.key;

  return (
    <li
      ref={row}
      className={cn(
        "border-b last:border-b-0",
        open && "bg-accent-bg",
        settled && "opacity-70",
      )}
      data-testid="panel-finding"
    >
      <button
        type="button"
        aria-expanded={open}
        className="grid w-full grid-cols-[auto_1fr] items-start gap-x-2 gap-y-0.5 px-2.5 py-2 text-start text-[0.8125rem] transition-colors hover:bg-accent-bg"
        onClick={() => onSelect({ issueKey: finding.issueKey, at })}
        onKeyDown={(event) => {
          /*
           * The whole list is walked from here, because this is where somebody
           * proofing a hundred references keeps their hands. Only while a row
           * has the focus: bound to the window instead, these would fire while
           * a person typed an "f" into their own manuscript.
           */
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
        }}
      >
        <span
          className={cn(
            "row-span-2 mt-1.5 size-2 shrink-0 rounded-full",
            finding.severity === "critical" && "bg-critical",
            finding.severity === "warning" && "bg-warning",
            finding.severity === "info" && "bg-muted-foreground",
          )}
          aria-hidden="true"
        />
        <span className={cn("min-w-0", (marked || ignored) && "line-through")}>
          {phrase(finding.titleKey, finding.params, finding.code)}
        </span>
        <span className="col-start-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-xs text-muted-foreground">
          {line === null ? null : <span>{t("place.line", { line })}</span>}
          {page === null ? null : (
            <span>
              {results("place.pages", { pages: format.number(page), count: 1 })}
            </span>
          )}
          {finding.places.length > 1 ? (
            <span data-testid="occurrence">
              {t("findings.occurrence", {
                index: at + 1,
                count: finding.places.length,
              })}
            </span>
          ) : null}
          <PlaceNote place={current.place} />
        </span>
      </button>

      {open ? (
        <div className="flex flex-wrap gap-1.5 px-2.5 pt-0.5 pb-2.5">
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

          {finding.detail === undefined ? null : (
            <p className="w-full text-xs text-muted-foreground">{finding.detail}</p>
          )}
        </div>
      ) : null}
    </li>
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
