"use client";

import * as React from "react";
import {
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { flushSync } from "react-dom";

import { Collapse } from "@/components/motion/collapse";
import {
  motionEasing,
  motionMs,
  motionTransition,
} from "@/components/motion/transitions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  type Counts,
  type Issue,
  type ModuleId,
  type ModuleResult,
  type ModuleStatus,
  type Severity,
} from "@/lib/domain";
import { fixedKey, useJobStore, useUiStore } from "@/stores";

/**
 * One check on one document (M1.9.2). The score as a number and as a bar, the
 * severity counters as dots so the state reads by shape and not by colour
 * alone, one headline problem in words, and a button that opens the findings in
 * place.
 */
export function CheckCard({
  docId,
  module,
  status,
  result,
  arrivalIndex,
  onRetry,
}: {
  readonly docId: string;
  readonly module: ModuleId;
  readonly status: ModuleStatus;
  readonly result: ModuleResult | undefined;
  /** Stagger only the first eight modules when several finish together. */
  readonly arrivalIndex: number;
  /**
   * Re-running one module is an operation on the job that already exists: the
   * text is not sent again and no idempotency key takes part (M1.8.6). Absent
   * once the server refuses further attempts.
   */
  readonly onRetry?: (module: ModuleId) => void;
}) {
  const t = useTranslations("results");
  const checkName = useTranslations("capabilities");
  const phrase = useTranslations();
  const open = useUiStore((state) => state.openCards.includes(`${docId}:${module}`));
  const toggleCard = useUiStore((state) => state.toggleCard);
  const [cardRef, morphing, toggleMorph] = useCardMorph(open, () =>
    toggleCard(docId, module),
  );

  const issues = result?.issues ?? [];
  const openable = issues.length > 0;
  const findingCount =
    issues.length > 0
      ? issues.length
      : status.counts.critical + status.counts.warning + status.counts.info;

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!openable || open || morphing) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, label, select, textarea") !== null
    ) {
      return;
    }
    if (window.getSelection()?.isCollapsed === false) return;
    toggleMorph();
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.8125rem] font-semibold tracking-[0.04em] text-muted-foreground uppercase">
          {checkName(module)}
        </p>
        <StatusBadge status={status} />
      </div>

      {status.state === "skipped" ? (
        /* A check that had nothing to check is not a zero. It is the module's
           verdict, not the interface's guess, which is why it does not lie
           about a bibliography our parser failed to recognise (§9). */
        <>
          <p className="font-mono text-3xl leading-none text-muted-foreground">—</p>
          <p className="text-sm text-muted-foreground" data-testid="skipped">
            {status.skippedReasonKey === undefined
              ? t("skipped")
              : phrase(status.skippedReasonKey, status.skippedReasonParams)}
          </p>
        </>
      ) : status.state === "error" ? (
        <>
          <p className="font-mono text-3xl leading-none text-muted-foreground">—</p>
          <p className="text-sm text-critical" data-testid="module-error">
            {t("moduleFailed", { code: status.errorCode ?? "" })}
          </p>
        </>
      ) : status.score === null ? (
        <>
          <p className="font-mono text-3xl leading-none" data-testid="finding-count">
            {findingCount}
            <small className="ms-1 text-sm font-medium text-muted-foreground">
              {module === "cite"
                ? t("claimsLabel", { count: findingCount })
                : t("findingsLabel", { count: findingCount })}
            </small>
          </p>
          <p className="text-[0.8125rem] text-muted-foreground">
            {module === "cite" ? t("citeNoScore") : t("checkNoScore")}
          </p>
          {status.headlineKey === undefined ? null : (
            <p className="text-sm leading-[1.45]">
              {phrase(status.headlineKey, status.headlineParams)}
            </p>
          )}
        </>
      ) : (
        <>
          <Score score={status.score} />
          <SeverityDots counts={status.counts} />
          {status.headlineKey === undefined ? null : (
            <p className="text-sm leading-[1.45]">
              {phrase(status.headlineKey, status.headlineParams)}
            </p>
          )}
        </>
      )}
    </>
  );

  return (
    <m.div
      ref={cardRef}
      data-testid="check-card"
      data-module={module}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        ...motionTransition.morph,
        delay: Math.min(arrivalIndex, 7) * 0.07,
      }}
      onClick={handleCardClick}
      className={cn(
        "flex flex-col gap-2.5 rounded-lg border bg-card p-3.5 transition-[background-color,border-color,box-shadow]",
        openable &&
          !open &&
          !morphing &&
          "cursor-pointer hover:border-primary/50 hover:bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))] hover:shadow-[var(--elevation-md)]",
        open && "col-span-full",
      )}
    >
      {/* While it is folded the card is a summary with one purpose - to open -
          so the whole of it is that button. Once open it holds rows a person is
          reading, and only its own button folds it again (§9). */}
      {body}

      {openable ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          aria-expanded={open}
          onClick={toggleMorph}
        >
          {open ? (
            <ChevronDownIcon aria-hidden="true" />
          ) : (
            <ChevronRightIcon aria-hidden="true" />
          )}
          {open ? t("close") : t("open", { count: issues.length })}
        </Button>
      ) : null}

      {/* The button lives only on a module in state `error`; when the server
          says the attempts are spent it goes, and the sentence above stays
          (M1.8.6). */}
      {status.state === "error" && onRetry !== undefined ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          data-testid="retry-module"
          onClick={() => onRetry(module)}
        >
          {t("retryModule")}
        </Button>
      ) : null}

      {open ? (
        <ul className="border-t">
          {issues.map((issue) => (
            <IssueRow key={issue.issueId} docId={docId} module={module} issue={issue} />
          ))}
        </ul>
      ) : null}
    </m.div>
  );
}

type MorphRun = {
  readonly card: Animation;
  readonly siblings: readonly Animation[];
  readonly placeholder: HTMLDivElement;
};

/**
 * The card is the one surface whose final grid column has no intermediate
 * value. Commit the final layout, hold its cell with a placeholder, then move
 * the real box between the measured rectangles (spec §14). Width and height
 * are animated as real dimensions, so text is never stretched by `scale`.
 */
function useCardMorph(open: boolean, commit: () => void) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const run = React.useRef<MorphRun | null>(null);
  const [morphing, setMorphing] = React.useState(false);
  const reducedMotion = useReducedMotion();

  const clearRun = React.useCallback((cancel: boolean) => {
    const active = run.current;
    if (active === null) return;
    run.current = null;
    if (cancel) {
      active.card.cancel();
      active.siblings.forEach((animation) => animation.cancel());
    }
    active.placeholder.remove();
    const card = ref.current;
    if (card !== null) {
      Object.assign(card.style, {
        position: "",
        insetInlineStart: "",
        top: "",
        width: "",
        height: "",
        margin: "",
        zIndex: "",
        overflow: "",
      });
    }
  }, []);

  React.useEffect(() => () => clearRun(true), [clearRun]);

  const toggle = () => {
    const card = ref.current;
    if (card === null || reducedMotion) {
      commit();
      return;
    }

    // If the direction changes mid-flight, these are the visible positions,
    // not the abandoned animation's original endpoints.
    const cardBefore = card.getBoundingClientRect();
    const candidates = new Set<HTMLElement>();
    for (
      let node: HTMLElement | null = card;
      node !== null && !node.hasAttribute("data-workspace-screen");
      node = node.parentElement
    ) {
      const parent = node.parentElement;
      if (parent === null) break;
      Array.from(parent.children).forEach((sibling) => {
        if (sibling !== node && sibling instanceof HTMLElement) candidates.add(sibling);
      });
    }
    const moving = Array.from(candidates);
    const before = moving.map((element) => element.getBoundingClientRect());

    clearRun(true);
    flushSync(() => {
      setMorphing(true);
      commit();
    });

    const cardAfter = card.getBoundingClientRect();
    const siblingAnimations = moving.flatMap((element, index) => {
      const oldRect = before[index];
      if (oldRect === undefined) return [];
      const newRect = element.getBoundingClientRect();
      const x = oldRect.left - newRect.left;
      const y = oldRect.top - newRect.top;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return [];
      return [
        element.animate(
          [{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }],
          {
            duration: motionMs.morph,
            easing: motionEasing.morph,
          },
        ),
      ];
    });

    const placeholder = document.createElement("div");
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.style.width = `${cardAfter.width}px`;
    placeholder.style.height = `${cardAfter.height}px`;
    if (!open) placeholder.style.gridColumn = "1 / -1";
    card.parentElement?.insertBefore(placeholder, card);

    Object.assign(card.style, {
      position: "fixed",
      insetInlineStart: "0px",
      top: "0px",
      width: `${cardBefore.width}px`,
      height: `${cardBefore.height}px`,
      margin: "0px",
      zIndex: "3",
      overflow: "hidden",
    });

    // Containment can change the origin of a fixed descendant. Measure that
    // origin rather than assuming it is the viewport.
    const origin = card.getBoundingClientRect();
    const from = {
      x: cardBefore.left - origin.left,
      y: cardBefore.top - origin.top,
    };
    const to = {
      x: cardAfter.left - origin.left,
      y: cardAfter.top - origin.top,
    };
    card.style.insetInlineStart = `${from.x}px`;
    card.style.top = `${from.y}px`;

    const cardAnimation = card.animate(
      [
        {
          insetInlineStart: `${from.x}px`,
          top: `${from.y}px`,
          width: `${cardBefore.width}px`,
          height: `${cardBefore.height}px`,
        },
        {
          insetInlineStart: `${to.x}px`,
          top: `${to.y}px`,
          width: `${cardAfter.width}px`,
          height: `${cardAfter.height}px`,
        },
      ],
      {
        duration: motionMs.morph,
        easing: motionEasing.morph,
      },
    );

    run.current = { card: cardAnimation, siblings: siblingAnimations, placeholder };
    cardAnimation.onfinish = () => {
      siblingAnimations.forEach((animation) => animation.cancel());
      clearRun(false);
      setMorphing(false);
    };
  };

  return [ref, morphing, toggle] as const;
}

/**
 * The colour comes from the semantic scale and never from the accent colour:
 * red below 50, amber to 79, green from 80 (§9). Cite has no score at all, and
 * a card without one is a normal sight rather than a data defect.
 */
function Score({ score }: { readonly score: number }) {
  const t = useTranslations("results");

  const tone = score < 50 ? "bg-critical" : score < 80 ? "bg-warning" : "bg-ok";
  return (
    <div>
      <p
        className="font-mono text-3xl leading-none font-semibold tracking-[-0.03em]"
        aria-label={t("scoreOutOf", { score })}
      >
        {score}
        {/* The scale is named rather than turned into a percentage: the
            contract defines `score` as 0-100 with no unit, and "%" would
            assert a proportion of something the server never states (§9). */}
        <small className="ms-0.5 text-sm font-medium tracking-normal text-muted-foreground">
          /100
        </small>
      </p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

/**
 * A counter dot: a bright fill with a ring of the severity's own text colour.
 * The ring is what gives the dot a defined edge on the card and on the page
 * ground alike, which frees the fill to be bright enough that the two
 * severities separate by lightness rather than by hue alone (§9).
 */
const TONE: Readonly<Record<Severity, string>> = {
  critical: "bg-[var(--critical-dot)] ring-1 ring-critical",
  warning: "bg-[var(--warning-dot)] ring-1 ring-warning",
  info: "bg-muted-foreground",
};

function SeverityDots({ counts }: { readonly counts: Counts }) {
  const t = useTranslations("results.severity");
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
      {(["critical", "warning"] as const).map((severity) => (
        <span key={severity} className="inline-flex items-center gap-1">
          <span
            className={cn("size-2.5 rounded-full", TONE[severity])}
            aria-hidden="true"
          />
          {t(severity, { count: counts[severity] })}
        </span>
      ))}
    </p>
  );
}

function StatusBadge({ status }: { readonly status: ModuleStatus }) {
  const t = useTranslations("results.status");
  const kind =
    status.state === "skipped"
      ? "notChecked"
      : status.state === "error"
        ? "failed"
        : status.score === null
          ? "noScore"
          : status.score < 50
            ? "critical"
            : status.score < 80
              ? "warning"
              : "clear";
  const tone =
    kind === "critical" || kind === "failed"
      ? "border-critical-border bg-critical-soft text-critical"
      : kind === "warning"
        ? "border-warning-border bg-warning-soft text-warning"
        : kind === "clear"
          ? "border-ok-border bg-ok-soft text-ok"
          : kind === "noScore"
            ? "border-primary/30 bg-primary-soft text-primary"
            : "border-border bg-muted text-muted-foreground";
  const label =
    kind === "critical"
      ? t("critical")
      : kind === "warning"
        ? t("warning")
        : kind === "clear"
          ? t("clear")
          : kind === "noScore"
            ? t("noScore")
            : kind === "notChecked"
              ? t("notChecked")
              : t("failed");

  return (
    <span
      className={cn("shrink-0 rounded-sm border px-1.5 py-0.5 text-xs font-medium", tone)}
    >
      {label}
    </span>
  );
}

function IssueRow({
  docId,
  module,
  issue,
}: {
  readonly docId: string;
  readonly module: ModuleId;
  readonly issue: Issue;
}) {
  const t = useTranslations("results");
  const phrase = useTranslations();
  const key = fixedKey(docId, module, issue.issueId);
  const open = useUiStore((state) => state.openIssues.includes(key));
  const toggleIssue = useUiStore((state) => state.toggleIssue);
  const marked = useJobStore((state) => state.fixed.includes(key));
  const toggleFixed = useJobStore((state) => state.toggleFixed);
  const severityLabel =
    issue.severity === "critical"
      ? t("severityName.critical")
      : issue.severity === "warning"
        ? t("severityName.warning")
        : t("severityName.info");

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
        <span className={cn("min-w-0 flex-1", marked && "line-through opacity-70")}>
          {phrase(issue.titleKey, issue.params)}
        </span>
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
                markup (§19). */}
            {issue.detail === undefined ? null : <p>{issue.detail}</p>}

            {issue.evidence.length === 0 ? null : (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {issue.evidence.map((fact, index) => (
                  <li key={index}>
                    <Fact fact={fact} />
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              {issue.actions.map((action, index) => {
                if (action.kind === "copy") {
                  return (
                    <Button
                      key={index}
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => void navigator.clipboard.writeText(action.value)}
                    >
                      <CopyIcon aria-hidden="true" />
                      {action.labelKey === undefined
                        ? t("copy")
                        : phrase(action.labelKey)}
                    </Button>
                  );
                }
                if (action.kind === "openSource") {
                  return (
                    <Button key={index} type="button" size="xs" variant="outline" asChild>
                      <a href={action.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLinkIcon aria-hidden="true" />
                        {action.labelKey === undefined
                          ? t("openSource")
                          : phrase(action.labelKey)}
                      </a>
                    </Button>
                  );
                }
                // An action of a kind this version does not define is simply not
                // offered; the rest of the card is shown (§5.9 of the contract).
                return null;
              })}

              {/* "Fixed" marks the finding as dealt with and touches no text. It
                  never travels to the server (M1.9.4). */}
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
            </div>
          </div>
        </div>
      </Collapse>
    </li>
  );
}

function Fact({ fact }: { readonly fact: Issue["evidence"][number] }) {
  const phrase = useTranslations();
  switch (fact.kind) {
    case "doi":
      return <>DOI {fact.value}</>;
    case "url":
      return (
        <a
          href={fact.value}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {fact.value}
        </a>
      );
    case "date":
    case "number":
    case "text":
      return (
        <>
          {phrase(fact.labelKey)}: {fact.value}
        </>
      );
    case "source":
      return (
        <>
          {phrase(fact.labelKey)}: {fact.title}
        </>
      );
    default:
      // A fact of an unfamiliar kind is passed over, and the rest is shown.
      return null;
  }
}
