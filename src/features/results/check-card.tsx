"use client";

import * as React from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { flushSync } from "react-dom";

import {
  motionEasing,
  motionMs,
  motionTransition,
} from "@/components/motion/transitions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  type Artifact,
  type ModuleId,
  type ModuleResult,
  type ModuleStatus,
} from "@/lib/domain";
import { useIntake } from "@/features/intake/use-intake";
import { useWording } from "@/lib/i18n";
import { anchoringOf } from "@/lib/normalize";
import { useUiStore } from "@/stores";

import { CiteOverlay } from "./cite-overlay";
import { IssueRow } from "./issue-row";
import { SeverityDots } from "./severity-dots";

/**
 * One check on one document. The score as a number and as a bar, the severity
 * counters as labelled dots, one headline problem in words, and a button that
 * opens the findings in place.
 */
export function CheckCard({
  docId,
  documentName,
  module,
  status,
  result,
  arrivalIndex,
  onRetry,
}: {
  readonly docId: string;
  /** The file a check produced is named after the document it was made from. */
  readonly documentName: string;
  readonly module: ModuleId;
  readonly status: ModuleStatus;
  readonly result: ModuleResult | undefined;
  /** Stagger only the first eight modules when several finish together. */
  readonly arrivalIndex: number;
  /**
   * Re-running one module is an operation on the job that already exists: the
   * text is not sent again and no idempotency key takes part. Absent once the
   * server refuses further attempts.
   */
  readonly onRetry?: (module: ModuleId) => void;
}) {
  const t = useTranslations("results");
  const checkName = useTranslations("capabilities");
  const phrase = useWording();
  const open = useUiStore((state) => state.openCards[`${docId}:${module}`] === true);
  const toggleCard = useUiStore((state) => state.toggleCard);
  const [cardRef, morphing, toggleMorph] = useCardMorph(open, () =>
    toggleCard(docId, module),
  );

  const issues = result?.issues ?? [];
  /*
   * Whether the offsets in this body were counted over the text we sent. The
   * findings are shown either way - a finding withheld is a check the person
   * paid for and did not receive - but when the answer is no, they are shown
   * without places, and the card says so rather than letting a list of
   * findings with no pages beside them look like findings that have none.
   */
  const anchoring = result === undefined ? { anchored: true } : anchoringOf(result);
  /*
   * Cite opens over the page instead of unfolding in the grid. It reports
   * nothing wrong: it proposes sources, and reading one is a title, its
   * authors, where it appeared and which databases returned it - a screenful
   * per claim, which is not something a card in a row of cards can hold.
   */
  const asOverlay = module === "cite";
  const [citeOpen, setCiteOpen] = React.useState(false);
  const drawn = useRowsDrawn(issues.length, open && !asOverlay);
  const openable = issues.length > 0;
  const findingCount =
    issues.length > 0
      ? issues.length
      : status.counts.critical + status.counts.warning + status.counts.info;

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!openable || (!asOverlay && (open || morphing))) return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, label, select, textarea") !== null
    ) {
      return;
    }
    if (window.getSelection()?.isCollapsed === false) return;
    if (asOverlay) setCiteOpen(true);
    else toggleMorph();
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
           about a bibliography our parser failed to recognise. */
        <>
          <p className="font-mono text-3xl leading-none text-muted-foreground">—</p>
          <p className="text-sm text-muted-foreground" data-testid="skipped">
            {status.skippedReasonKey === undefined
              ? t("skipped")
              : phrase(status.skippedReasonKey, status.skippedReasonParams, t("skipped"))}
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
        // The card carries its own width, so the row it stands in can be a
        // wrapping row that centres what is on it - including the last one,
        // which is the row a grid leaves hanging off the left.
        "flex w-full flex-col gap-2.5 rounded-lg border bg-card p-3.5 transition-[background-color,border-color,box-shadow] sm:w-[21rem]",
        openable &&
          !open &&
          !morphing &&
          "cursor-pointer hover:border-primary/50 hover:bg-[color-mix(in_srgb,var(--muted)_40%,var(--card))] hover:shadow-[var(--elevation-md)]",
        open && "sm:w-full",
      )}
    >
      {/* While it is folded the card is a summary with one purpose - to open -
          so the whole of it is that button. Once open it holds rows a person is
          reading, and only its own button folds it again. */}
      {body}

      {openable && asOverlay ? (
        <Button
          type="button"
          variant="outlineOnCard"
          size="sm"
          className="self-start"
          data-testid="open-cite"
          onClick={() => setCiteOpen(true)}
        >
          <ChevronRightIcon aria-hidden="true" />
          {t("open", { count: issues.length })}
        </Button>
      ) : null}

      {openable && !asOverlay ? (
        <Button
          type="button"
          variant="outlineOnCard"
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

      {/* The body describes a different text than the one on screen, so every
          place in it points into a document that does not exist here. The
          identifier of the request that brought it is on the card, because it
          is the one thing a person can put in a message to us that names what
          they actually received. */}
      {!anchoring.anchored ? (
        <p
          role="status"
          data-testid="not-anchored"
          className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft p-2.5 text-[0.8125rem] text-warning"
        >
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {anchoring.reason === "offsetUnit"
              ? t("notAnchoredUnit")
              : t("notAnchoredText")}
            {result?.requestId === undefined ? null : (
              <>
                {" "}
                <span className="font-mono break-all">{result.requestId}</span>
              </>
            )}
          </span>
        </p>
      ) : null}

      {/* A file this check produced - a corrected bibliography, a generated
          glossary - is a text of its own and not the manuscript, so it opens in
          the editor of its own. Reading it, correcting it and saving it all
          happen there, because the editor is the one place a document is
          downloaded from. */}
      {(result?.artifacts ?? []).map((artifact, index) => (
        <OpenArtifactButton
          key={index}
          docId={docId}
          documentName={documentName}
          module={module}
          artifact={artifact}
        />
      ))}

      {/* The button lives only on a module in state `error`; when the server
          says the attempts are spent it goes, and the sentence above stays. */}
      {status.state === "error" && onRetry !== undefined ? (
        <Button
          type="button"
          variant="outlineOnCard"
          size="sm"
          className="w-full"
          data-testid="retry-module"
          onClick={() => onRetry(module)}
        >
          {t("retryModule")}
        </Button>
      ) : null}

      {open && !asOverlay ? (
        /*
         * There is no limit on the number of findings and there are no
         * truncated lists: a finding dropped because the interface was built
         * for a hundred makes the whole result untrustworthy. What is paced is
         * how much of it the browser is asked to do at once, and that is a
         * rendering decision rather than a limit on the product - every finding
         * ends up in the document.
         *
         * Two halves, and they answer different costs. `content-visibility` is
         * the free one: a row below the fold is skipped for layout, style and
         * paint until it comes near, while staying in the document, findable by
         * the browser's own search and reachable by Tab. The intrinsic size is
         * what a collapsed row measures, so the scrollbar does not jump as rows
         * are drawn.
         *
         * What it does not answer is the cost of building the rows in the first
         * place. A dissertation can return thousands of findings, and asking
         * React to mount thousands of components in one pass blocks the tab for
         * as long as it takes, however little of the result is painted - so the
         * card opens with a first slice and the rest is added in the browser's
         * idle time. The list is complete a moment later without the moment
         * being one the person spends waiting.
         */
        <ul className="border-t [&>li]:[contain-intrinsic-size:auto_2.25rem] [&>li]:[content-visibility:auto]">
          {issues.slice(0, drawn).map((issue) => (
            <IssueRow
              key={issue.issueId}
              docId={docId}
              module={module}
              issue={issue}
              anchored={anchoring.anchored}
            />
          ))}
        </ul>
      ) : null}

      {asOverlay ? (
        <CiteOverlay
          open={citeOpen}
          docId={docId}
          documentName={documentName}
          result={result}
          onClose={() => setCiteOpen(false)}
        />
      ) : null}
    </m.div>
  );
}

/**
 * The file the check wrote, taken into the browser as a text and opened. The
 * server sends it as text and the browser assembles the file; there is no
 * address anywhere from which the contents of a manuscript come back off a
 * server.
 */
function OpenArtifactButton({
  docId,
  documentName,
  module,
  artifact,
}: {
  readonly docId: string;
  readonly documentName: string;
  readonly module: ModuleId;
  readonly artifact: Artifact;
}) {
  const t = useTranslations("results");
  const phrase = useWording();
  const { adoptArtifact } = useIntake();
  const openOverlay = useUiStore((state) => state.openOverlay);

  return (
    <Button
      type="button"
      variant="outlineOnCard"
      size="sm"
      className="self-start"
      data-testid="open-artifact"
      onClick={() => {
        void adoptArtifact({
          docId,
          module,
          name: `${baseName(documentName)}-${module}.${artifact.kind}`,
          format: artifact.kind,
          text: artifact.content,
        }).then((id) => openOverlay({ docId: id, mode: "edit" }));
      }}
    >
      <PencilIcon aria-hidden="true" />
      {/* The module says what the file is by a dictionary key - "the corrected
          bibliography", "the generated glossary" - and the button says that.
          A key this release has no wording for falls back to naming the format,
          which is the least a person needs to know before opening it. */}
      {phrase(
        artifact.labelKey,
        undefined,
        t("openArtifact", {
          extension: artifact.kind,
        }),
      )}
    </Button>
  );
}

/** The document's name without its extension, so the new one is not a second. */
function baseName(name: string): string {
  return name.replace(/\.[A-Za-z0-9]+$/, "");
}

type MorphRun = {
  readonly card: Animation;
  readonly siblings: readonly Animation[];
  readonly placeholder: HTMLDivElement;
};

/**
 * The first slice of a list of findings, and how much is added to it at a time.
 *
 * The first number is what an ordinary card holds whole: most checks on most
 * documents return fewer findings than this, so for them the list is complete
 * on the first render and none of the machinery below ever runs. The second is
 * a step large enough that a list of thousands is finished in a handful of
 * steps rather than in hundreds of them.
 */
const FIRST_ROWS = 150;
const MORE_ROWS = 300;

/**
 * Runs the browser's idle time, or the nearest thing to it. `requestIdleCallback`
 * is what should pace this - the browser knows what else it has to do - and
 * Safari does not have it, where a task on the queue is still enough to let a
 * paint and a keypress through between two slices.
 */
function whenIdle(run: () => void): () => void {
  if (typeof globalThis.requestIdleCallback === "function") {
    const handle = globalThis.requestIdleCallback(run);
    return () => globalThis.cancelIdleCallback(handle);
  }
  const handle = globalThis.setTimeout(run, 32);
  return () => globalThis.clearTimeout(handle);
}

/**
 * How many rows of a list are in the document, growing until all of them are.
 *
 * It grows rather than paginates because the whole list has to be there: the
 * browser's own search has to find a finding the person half-remembers, and Tab
 * has to reach it. A "show more" button would make both of those true only for
 * the part somebody had already opened.
 */
function useRowsDrawn(total: number, active: boolean): number {
  const [drawn, setDrawn] = React.useState(() => Math.min(total, FIRST_ROWS));
  const [showing, setShowing] = React.useState({ total, active });

  /*
   * Back to the first slice whenever the list itself changes or the card
   * closes. A retry brings a new body, and a card reopened on it would
   * otherwise start at whatever count the previous attempt had grown to -
   * mounting a thousand rows in the one render this exists to avoid.
   *
   * It happens while rendering rather than in an effect: an effect would draw
   * the old count once first, which for a card that has just been given a
   * shorter list means a render of rows that are no longer there.
   */
  if (showing.total !== total || showing.active !== active) {
    setShowing({ total, active });
    setDrawn(Math.min(total, FIRST_ROWS));
  }

  React.useEffect(() => {
    if (!active || drawn >= total) return;
    return whenIdle(() => {
      setDrawn((current) => Math.min(total, current + MORE_ROWS));
    });
  }, [active, drawn, total]);

  return drawn;
}

/**
 * The card is the one surface whose final grid column has no intermediate
 * value. Commit the final layout, hold its cell with a placeholder, then move
 * the real box between the measured rectangles. Width and height are animated
 * as real dimensions, so text is never stretched by `scale`.
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
 * red below 50, amber to 79, green from 80. Cite has no score at all, and a
 * card without one is a normal sight rather than a data defect.
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
            contract defines `score` as 0-100 with no unit, and "%" would assert
            a proportion of something the server never states. */}
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
