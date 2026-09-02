"use client";

import * as React from "react";
import {
  CheckCheckIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Collapse } from "@/components/motion/collapse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { type Issue, type ModuleId } from "@/lib/domain";
import { useWording } from "@/lib/i18n";
import { fixedKey, useJobStore, useUiStore } from "@/stores";

/**
 * One finding inside a check card: the row that names it, and the panel that
 * opens under it with the facts, the actions and the mark.
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
  const phrase = useWording();
  const key = fixedKey(docId, module, issue.issueId);
  const open = useUiStore((state) => state.openIssues[key] === true);
  const toggleIssue = useUiStore((state) => state.toggleIssue);
  const marked = useJobStore((state) => state.fixed[key] === true);
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
          {phrase(issue.titleKey, issue.params, issue.code)}
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
                markup. */}
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
                // An action of a kind this version does not define is simply
                // not offered; the rest of the card is shown.
                return null;
              })}

              {/* "Fixed" marks the finding as dealt with and touches no text.
                  It never travels to the server. */}
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

/**
 * One fact under a finding. The label is a sentence and the value is a thing to
 * be compared or copied - a DOI, an address, a date, a count - so the value is
 * set in the mono face and the label is not.
 */
function Fact({ fact }: { readonly fact: Issue["evidence"][number] }) {
  switch (fact.kind) {
    case "doi":
      return (
        <>
          DOI <span className="font-mono">{fact.value}</span>
        </>
      );
    case "url":
      return (
        <a
          href={fact.value}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono underline"
        >
          {fact.value}
        </a>
      );
    case "date":
    case "number":
    case "text":
      return (
        <>
          <FactLabel labelKey={fact.labelKey} />
          <span className="font-mono">{fact.value}</span>
        </>
      );
    case "source":
      return (
        <>
          <FactLabel labelKey={fact.labelKey} />
          {fact.title}
        </>
      );
    default:
      // A fact of an unfamiliar kind is passed over, and the rest is shown.
      return null;
  }
}

/**
 * The name of one fact. A key this release has no wording for leaves the value
 * standing on its own rather than putting a sentence of apology where a word
 * like "DOI" belongs: the value is the part that is worth reading, and a
 * missing label costs nothing beside it.
 */
function FactLabel({ labelKey }: { readonly labelKey: string }) {
  const phrase = useWording();
  const label = phrase(labelKey, undefined, "");
  return label === "" ? null : <>{label}: </>;
}
