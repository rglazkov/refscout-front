"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { Collapse } from "@/components/motion/collapse";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { type BiblioRecord } from "@/lib/domain";
import { useWording } from "@/lib/i18n";

/**
 * One work, as the databases returned it.
 *
 * There is one of these in the product and two screens draw it: the candidates
 * Cite proposes for a claim, and the results of a search. They are the same
 * record - the contract defines it once and both answers carry it - and a card
 * written twice is two cards that differ by the second edit, which on this
 * record means a title shown one way beside a claim and another way in a list.
 *
 * What differs between the two screens is what a person does with the record,
 * so that is the one thing this component does not decide: the buttons are
 * handed in. Everything above them - the title, the authors, where it appeared,
 * how often it has been cited, which databases returned it, the abstract - is
 * fixed here.
 *
 * Every field is somebody else's text and reaches the DOM as a text node. The
 * link is the exception in kind rather than in trust: it is an address, so it
 * is used only when the schema has already accepted it as an http address.
 */
export function BiblioRecordCard({
  record,
  relevance,
  ordinal,
  highlighted = false,
  actions,
  testId,
  ...rest
}: {
  readonly record: BiblioRecord;
  /** 0-1, as the databases scored it. Cite always has one; a search may not. */
  readonly relevance?: number;
  /** The position in the list, drawn beside the title where a list is ranked. */
  readonly ordinal?: number;
  /** The record has been picked for the export. */
  readonly highlighted?: boolean;
  readonly actions?: React.ReactNode;
  readonly testId?: string;
} & Omit<React.ComponentProps<"article">, "children">) {
  const t = useTranslations("record");
  const source = useWording();
  const format = useFormatter();
  const [showAbstract, setShowAbstract] = React.useState(false);
  const href = linkOf(record);

  const meta = [
    record.year === undefined ? null : String(record.year),
    record.venue,
    record.citedBy === undefined
      ? null
      : t("citedBy", { count: format.number(record.citedBy) }),
    relevance === undefined
      ? null
      : t("relevance", { score: Math.round(relevance * 100) }),
  ].filter((part) => part !== null && part !== undefined);

  return (
    <article
      data-testid={testId ?? "biblio-record"}
      data-highlighted={highlighted}
      className={cn(
        "space-y-1.5 rounded-lg border bg-control-card p-3",
        highlighted && "border-primary/40 bg-primary-soft",
      )}
      {...rest}
    >
      <h4 className="text-sm font-semibold">
        {ordinal === undefined ? null : (
          <span className="me-1.5 font-mono text-xs font-medium text-muted-foreground">
            {format.number(ordinal)}
          </span>
        )}
        {href === undefined ? (
          record.title
        ) : (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-4 hover:underline"
          >
            {record.title}
          </a>
        )}
      </h4>

      {record.authors.length === 0 ? null : (
        <p className="text-xs text-muted-foreground">{record.authors.join("; ")}</p>
      )}
      {meta.length === 0 ? null : (
        <p className="text-xs text-muted-foreground">{meta.join(" · ")}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {record.sources.map((id) => (
          <span
            key={id}
            className="rounded-sm border bg-muted px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted-foreground"
          >
            {source(`sources.${id}`, undefined, id)}
          </span>
        ))}
        {record.doiVerified === true ? (
          <span className="rounded-sm border border-ok-border bg-ok-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold text-ok">
            {t("doiVerified")}
          </span>
        ) : null}
        {/* Two badges of the same colour say one thing twice: a resolved DOI is
            a check that passed, and open access is a property of the work. */}
        {record.openAccess ? (
          <span className="rounded-sm border border-primary/35 bg-primary-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold text-primary">
            {t("openAccess")}
          </span>
        ) : null}
      </div>

      {record.abstract === undefined ? null : (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="-ms-2"
            aria-expanded={showAbstract}
            onClick={() => setShowAbstract(!showAbstract)}
          >
            <ChevronDownIcon
              className={cn(
                "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                !showAbstract && "-rotate-90",
              )}
              aria-hidden="true"
            />
            {t("abstract")}
          </Button>
          <Collapse open={showAbstract}>
            <p className="pt-1 text-xs leading-relaxed text-muted-foreground">
              {record.abstract}
            </p>
          </Collapse>
        </div>
      )}

      {actions === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">{actions}</div>
      )}
    </article>
  );
}

/**
 * Where the record can be read. The address the database gave is preferred over
 * one built from the DOI, because it is the one that was checked; a DOI is a
 * name rather than an address, so it is turned into one only when nothing else
 * is on offer.
 */
function linkOf(record: BiblioRecord): string | undefined {
  if (record.url !== undefined) return record.url;
  if (record.doi !== undefined) return `https://doi.org/${record.doi}`;
  return undefined;
}
