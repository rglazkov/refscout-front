"use client";

import * as React from "react";
import {
  BanIcon,
  CheckCheckIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  PencilIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Collapse } from "@/components/motion/collapse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { placeKey, useIssuePlaces } from "@/lib/anchor";
import { placesOf } from "@/lib/docs";
import { isResolved, type Issue, type ModuleId } from "@/lib/domain";
import { useWording } from "@/lib/i18n";
import { fixedKey, useJobStore, useUiStore } from "@/stores";

import { IssueDetails } from "./details";

/**
 * One finding inside a check card: the row that names it, the place it points
 * at said in words, and the panel that opens under it with the facts, the
 * actions and the marks.
 */
export function IssueRow({
  docId,
  module,
  issue,
}: {
  readonly docId: string;
  readonly module: ModuleId;
  readonly issue: Issue;
}) {
  const t = useTranslations("results");
  const format = useFormatter();
  const phrase = useWording();
  const key = fixedKey(docId, module, issue.issueId);
  const open = useUiStore((state) => state.openIssues[key] === true);
  const toggleIssue = useUiStore((state) => state.toggleIssue);
  const openOverlay = useUiStore((state) => state.openOverlay);
  const marked = useJobStore((state) => state.fixed[key] === true);
  const ignored = useJobStore((state) => state.ignored[key] === true);
  const toggleFixed = useJobStore((state) => state.toggleFixed);
  const toggleIgnored = useJobStore((state) => state.toggleIgnored);
  const severityLabel =
    issue.severity === "critical"
      ? t("severityName.critical")
      : issue.severity === "warning"
        ? t("severityName.warning")
        : t("severityName.info");

  /*
   * Where this finding ended up on the live text, and what that is worth
   * saying: the page it falls on, the entry of a bibliography it names, the
   * sentence the module quoted, and whether it could be placed at all. The
   * resolver works it out in a worker when the answer arrives and again when
   * the text settles after being edited; here it is only read.
   */
  const resolved = useIssuePlaces(docId, module, issue.issueId);
  const places = React.useMemo(() => placesOf(resolved), [resolved]);
  /** The first place that can actually be jumped to, if any. */
  const target = resolved.find((place) => isResolved(place) && place.range !== undefined);

  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-0.5 py-2 text-start text-sm transition-colors hover:bg-accent-bg"
        onClick={() => toggleIssue(key)}
      >
        <ChevronRightIcon
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
        <span
          className={cn(
            "shrink-0 rounded-sm border px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase",
            issue.severity === "critical" &&
              "border-critical-border bg-critical-soft text-critical",
            issue.severity === "warning" &&
              "border-warning-border bg-warning-soft text-warning",
            issue.severity === "info" && "border-border bg-muted text-muted-foreground",
          )}
        >
          {severityLabel}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1",
            (marked || ignored) && "line-through opacity-70",
          )}
        >
          {phrase(issue.titleKey, issue.params, issue.code)}
        </span>

        {/* Where it is, in the words available before anything is highlighted:
            the page it falls on, the entry of the bibliography it names, and
            how many places there are when there is more than one. This is what
            a person takes to their own editor. */}
        {places.pages.length > 0 ? (
          <span
            className="shrink-0 font-mono text-xs text-muted-foreground"
            data-testid="issue-pages"
          >
            {t("place.pages", {
              pages: places.pages.map((page) => format.number(page)).join(", "),
              count: places.pages.length,
            })}
          </span>
        ) : null}
        {places.pages.length === 0 && places.bibkeys.length > 0 ? (
          <span
            className="hidden max-w-40 shrink-0 truncate font-mono text-xs text-muted-foreground sm:inline"
            data-testid="issue-bibkey"
          >
            {places.bibkeys[0]}
          </span>
        ) : null}
        {places.count > 1 ? (
          <span
            className="shrink-0 font-mono text-xs text-muted-foreground"
            data-testid="issue-occurrences"
          >
            {t("place.occurrences", { count: places.count })}
          </span>
        ) : null}

        {/* What became of the address, in words. A finding whose place could
            not be worked out keeps its card and says so, because the
            alternative - a page number beside it that came from somewhere else -
            reads exactly like a page number that is right. */}
        {places.edited ? (
          <span className="shrink-0 text-xs text-warning" data-testid="issue-edited">
            {t("place.edited")}
          </span>
        ) : places.lost > 0 && places.resolved === 0 ? (
          <span className="shrink-0 text-xs text-warning" data-testid="issue-lost">
            {t("place.lost")}
          </span>
        ) : null}
      </button>

      <Collapse open={open}>
        <div className="pt-1 pb-3">
          <div
            className={cn(
              "space-y-2 rounded-lg border border-s-[3px] p-3 text-sm shadow-sm",
              issue.severity === "critical" &&
                "border-critical-border border-s-critical bg-critical-soft",
              issue.severity === "warning" &&
                "border-warning-border border-s-warning bg-warning-soft",
              issue.severity === "info" &&
                "border-border border-s-muted-foreground bg-muted",
            )}
          >
            {/* Plain text from the module, placed as a text node and never as
                markup. */}
            {issue.detail === undefined ? null : <p>{issue.detail}</p>}

            {/* The sentence the module was looking at. It is the third way of
                naming a place, and the one that works in a document with no
                pages and no bibliography keys. */}
            {places.quote === undefined ? null : (
              <p
                className="border-s-2 ps-2.5 font-mono text-xs break-words text-muted-foreground"
                data-testid="issue-quote"
              >
                {places.quote}
              </p>
            )}

            <IssueDetails module={module} issue={issue} />

            <div className="flex flex-wrap gap-2">
              {issue.actions.map((action, index) => {
                if (action.kind === "copy") {
                  return (
                    <Button
                      key={index}
                      type="button"
                      size="xs"
                      variant="outlineOnCard"
                      onClick={() => void navigator.clipboard.writeText(action.value)}
                    >
                      <CopyIcon aria-hidden="true" />
                      {phrase(action.labelKey ?? "", undefined, t("copy"))}
                    </Button>
                  );
                }
                if (action.kind === "openSource") {
                  return (
                    <Button
                      key={index}
                      type="button"
                      size="xs"
                      variant="outlineOnCard"
                      asChild
                    >
                      <a href={action.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLinkIcon aria-hidden="true" />
                        {phrase(action.labelKey ?? "", undefined, t("openSource"))}
                      </a>
                    </Button>
                  );
                }
                /*
                 * A replacement the module proposes is not applied from here.
                 * Applying one changes the manuscript, and a change to the
                 * manuscript is made where the manuscript is - in the editor,
                 * inside the undo history, with the person looking at the
                 * sentence it lands in. The button that takes them there is
                 * below, and it is the same one that takes them to the place.
                 * It travels in the report as well, beside the finding, for
                 * somebody working in their own editor.
                 */
                // An action of a kind this version does not define is simply
                // not offered; the rest of the card is shown.
                return null;
              })}

              {/* One step to the place in the text, and one step back: the
                  overlay opens scrolled to the fragment with this finding
                  selected beside it, and closing it returns here with the card
                  still open. Offered only where there is somewhere to go. */}
              {target === undefined ? null : (
                <Button
                  type="button"
                  size="xs"
                  variant="outlineOnCard"
                  data-testid="show-in-text"
                  onClick={() =>
                    openOverlay({
                      docId: target.docId,
                      focus: placeKey(
                        docId,
                        module,
                        issue.issueId,
                        resolved.indexOf(target),
                      ),
                    })
                  }
                >
                  <PencilIcon aria-hidden="true" />
                  {t("showInText")}
                </Button>
              )}

              {/* Two marks, and they mean different things: "I have dealt with
                  this" and "the check is right and I do not want it". Each is a
                  toggle, pressing one clears the other, and neither touches the
                  text or travels to the server. */}
              <Button
                type="button"
                size="xs"
                variant={marked ? "secondary" : "outline"}
                aria-pressed={marked}
                onClick={() => toggleFixed(docId, module, issue.issueId)}
              >
                <CheckCheckIcon aria-hidden="true" />
                {t("fixed")}
              </Button>
              <Button
                type="button"
                size="xs"
                variant={ignored ? "secondary" : "outline"}
                aria-pressed={ignored}
                data-testid="ignore-issue"
                onClick={() => toggleIgnored(docId, module, issue.issueId)}
              >
                <BanIcon aria-hidden="true" />
                {t("ignore")}
              </Button>
            </div>
          </div>
        </div>
      </Collapse>
    </li>
  );
}
