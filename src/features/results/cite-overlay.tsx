"use client";

import * as React from "react";
import {
  CheckIcon,
  ChevronRightIcon,
  CopyIcon,
  PencilIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { BiblioRecordCard } from "@/features/records/record-card";
import { Collapse } from "@/components/motion/collapse";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { toBibtex } from "@/lib/export";
import { type CiteCandidate, type Issue, type ModuleResult } from "@/lib/domain";
import { useVisualViewportHeight } from "@/features/editor/use-visual-viewport";
import { useIntake } from "@/features/intake/use-intake";
import { useWording } from "@/lib/i18n";
import { acceptedKey, useJobStore, useUiStore } from "@/stores";

/**
 * Cite, opened over the page.
 *
 * Cite is not a check in the sense the other three are. It reports nothing
 * wrong: it takes the claims in a piece of writing and proposes real sources
 * for each of them, and what a person does here is read those sources and
 * decide. That is a screenful of work per claim - a title, its authors, where
 * it appeared, how often it has been cited, which databases returned it - and
 * it does not fit in a card in a grid beside three cards of findings.
 *
 * So the card opens an overlay instead of unfolding in place, and the overlay
 * is the size of the window.
 */
export function CiteOverlay({
  open,
  docId,
  documentName,
  result,
  onClose,
}: {
  readonly open: boolean;
  readonly docId: string;
  readonly documentName: string;
  readonly result: ModuleResult | undefined;
  readonly onClose: () => void;
}) {
  const t = useTranslations("results.cite");
  const format = useFormatter();
  const height = useVisualViewportHeight();
  const openOverlay = useUiStore((state) => state.openOverlay);
  const accepted = useJobStore((state) => state.accepted);
  const { adoptArtifact } = useIntake();

  const claims = (result?.issues ?? []).filter((issue) => issue.cite !== undefined);
  const candidateCount = claims.reduce(
    (total, claim) => total + (claim.cite?.candidates.length ?? 0),
    0,
  );
  const acceptedRecords = claims.flatMap((claim) =>
    (claim.cite?.candidates ?? []).filter(
      (candidate) =>
        accepted[acceptedKey(docId, claim.issueId, candidate.candidateId)] === true,
    ),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        data-testid="cite-overlay"
        style={{ "--overlay-height": height } as React.CSSProperties}
        className="flex h-[var(--overlay-height)] max-w-none flex-col gap-0 rounded-none p-0 sm:h-[calc(var(--overlay-height)-1rem)] sm:max-w-5xl sm:rounded-lg"
      >
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-lg font-semibold">
              {t("title", { name: documentName })}
            </DialogTitle>
            <DialogDescription className="text-[0.8125rem]">
              {t("lead")}
            </DialogDescription>
          </div>
          <span className="rounded-sm border border-primary/35 bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
            {t("acceptedCount", { count: acceptedRecords.length })}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t("close")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
          {/* The text this was checked against. Cite's answer is about a
              particular text, and the way to read and correct that text is the
              same editor as everywhere else. */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <span className="flex-1 text-sm font-medium">{t("checkedAgainst")}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {documentName}
            </span>
            <Button
              type="button"
              variant="outlineOnCard"
              size="sm"
              onClick={() => openOverlay({ docId, mode: "edit" })}
            >
              <PencilIcon aria-hidden="true" />
              {t("openText")}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">
              {format.number(claims.length)}
            </span>{" "}
            {t("claims", { count: claims.length })} ·{" "}
            <span className="font-mono font-semibold text-foreground">
              {format.number(candidateCount)}
            </span>{" "}
            {t("candidates", { count: candidateCount })}
          </p>

          {/* Said once, at the top, and not repeated under every candidate: a
              warning printed forty times is read none of them. */}
          <p className="flex items-start gap-2 rounded-lg border border-warning-border bg-warning-soft p-3 text-[0.8125rem] text-warning">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold">{t("disclaimerLead")}</strong>{" "}
              {t("disclaimer")}
            </span>
          </p>

          {claims.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noClaims")}</p>
          ) : (
            claims.map((claim) => (
              <Claim key={claim.issueId} docId={docId} claim={claim} />
            ))
          )}
        </div>

        {/* What the reading was for. The sources are assembled into a .bib in
            the browser and opened in the editor, because the editor is the one
            place a file is downloaded from. */}
        <div className="flex flex-wrap items-center gap-2 border-t p-4">
          <span className="flex-1 text-sm">{t("exportLabel")}</span>
          <Button
            type="button"
            size="sm"
            data-testid="cite-export"
            aria-disabled={acceptedRecords.length === 0}
            onClick={() => {
              if (acceptedRecords.length === 0) return;
              void adoptArtifact({
                docId,
                module: "cite",
                name: `${documentName.replace(/\.[A-Za-z0-9]+$/, "")}-sources.bib`,
                format: "bib",
                text: toBibtex(acceptedRecords),
              }).then((id) => openOverlay({ docId: id, mode: "edit" }));
            }}
          >
            <PencilIcon aria-hidden="true" />
            {t("exportAction", { count: acceptedRecords.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One claim: the sentence out of the manuscript, the query that was run for it,
 * and the sources that came back. The candidates the databases already saw
 * cited, and the ones scored low, are folded away - they are answers to a
 * question the person is not asking first.
 */
function Claim({ docId, claim }: { readonly docId: string; readonly claim: Issue }) {
  const t = useTranslations("results.cite");
  const phrase = useWording();
  const candidates = claim.cite?.candidates ?? [];
  const proposed = candidates.filter(
    (candidate) => !candidate.alreadyCited && !candidate.lowRelevance,
  );
  const cited = candidates.filter((candidate) => candidate.alreadyCited);
  const low = candidates.filter(
    (candidate) => candidate.lowRelevance && !candidate.alreadyCited,
  );

  return (
    <section
      className="space-y-2.5 rounded-lg border bg-card p-3.5"
      data-testid="cite-claim"
    >
      <p className="text-sm leading-relaxed">
        {claimText(claim, phrase(claim.titleKey, undefined, claim.code))}
      </p>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-sm border border-warning-border bg-warning-soft px-2 py-0.5 font-semibold text-warning">
          {t("needsSource")}
        </span>
        {claim.cite === undefined ? null : (
          <>
            <span>{t("searched")}</span>
            <span className="rounded-sm border bg-muted px-2 py-0.5 font-mono">
              {claim.cite.query}
            </span>
          </>
        )}
      </div>

      <div className="space-y-2">
        {proposed.map((candidate) => (
          <Candidate
            key={candidate.candidateId}
            docId={docId}
            issueId={claim.issueId}
            candidate={candidate}
          />
        ))}
      </div>

      <Group label={t("alreadyCited", { count: cited.length })} count={cited.length}>
        {cited.map((candidate) => (
          <Candidate
            key={candidate.candidateId}
            docId={docId}
            issueId={claim.issueId}
            candidate={candidate}
          />
        ))}
      </Group>

      <Group label={t("lowRelevance", { count: low.length })} count={low.length}>
        {low.map((candidate) => (
          <Candidate
            key={candidate.candidateId}
            docId={docId}
            issueId={claim.issueId}
            candidate={candidate}
          />
        ))}
      </Group>
    </section>
  );
}

function Group({
  label,
  count,
  children,
}: {
  readonly label: string;
  readonly count: number;
  readonly children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  if (count === 0) return null;
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="-ms-2"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronRightIcon
          className={cn(
            "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
        {label}
      </Button>
      <Collapse open={open}>
        <div className="space-y-2 pt-2">{children}</div>
      </Collapse>
    </div>
  );
}

/**
 * One source, as the databases returned it, with what a person does with it
 * here: accept it into the export, copy it, or go and read it.
 *
 * The record itself is drawn by the card the search screen uses - the same
 * component, because it is the same record - and only the buttons belong to
 * this screen.
 */
function Candidate({
  docId,
  issueId,
  candidate,
}: {
  readonly docId: string;
  readonly issueId: string;
  readonly candidate: CiteCandidate;
}) {
  const t = useTranslations("results.cite");
  const accepted = useJobStore(
    (state) =>
      state.accepted[acceptedKey(docId, issueId, candidate.candidateId)] === true,
  );
  const toggleAccepted = useJobStore((state) => state.toggleAccepted);

  return (
    <BiblioRecordCard
      record={candidate}
      relevance={candidate.relevance}
      highlighted={accepted}
      testId="cite-candidate"
      data-accepted={accepted}
      actions={
        <>
          {/* On a control fill, so it takes the other surface. */}
          <Button
            type="button"
            size="xs"
            variant={accepted ? "default" : "outline"}
            aria-pressed={accepted}
            data-testid="cite-use"
            onClick={() => toggleAccepted(docId, issueId, candidate.candidateId)}
          >
            <CheckIcon aria-hidden="true" />
            {accepted ? t("accepted") : t("use")}
          </Button>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void navigator.clipboard.writeText(toBibtex([candidate]))}
          >
            <CopyIcon aria-hidden="true" />
            {t("copyBibtex")}
          </Button>
        </>
      }
    />
  );
}

/**
 * The claim itself. The anchor carries the sentence out of the manuscript,
 * which is what the person recognises; the phrase from the dictionary is the
 * fallback for a claim that arrived without one.
 */
function claimText(claim: Issue, fallback: string): string {
  for (const anchor of claim.anchors) {
    if (anchor.kind === "range" || anchor.kind === "quote") return anchor.quote;
  }
  return claim.detail ?? fallback;
}
