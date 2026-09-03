"use client";

import * as React from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  LockIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { m } from "motion/react";

import { DocumentIcon } from "@/components/document-icon";
import { Collapse } from "@/components/motion/collapse";
import { motionTransition } from "@/components/motion/transitions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ZoneBoundary } from "@/components/shell/zone-boundary";
import { cn } from "@/lib/cn";
import { type BufferItem, moduleIds } from "@/lib/domain";
import { useIntakeApi } from "@/features/intake/intake-context";
import { DocumentPlan } from "@/features/plan/document-plan";
import { lockOf } from "@/features/plan/compute";
import { useLockPress } from "@/features/plan/use-lock";
import { useBufferStore, useEntitlementsStore, useUiStore } from "@/stores";

import { DocumentSettings } from "./document-settings";
import { ExtractAnnouncement, ExtractNotice, needsNotice } from "./extract-notice";

/**
 * One document in the buffer. A type icon, the name - which opens the text -
 * the volume in words and characters, four checkboxes named the way the product
 * names its checks, a button for the venue's requirements and one to remove the
 * document.
 *
 * There is no "document role" on screen. The person is shown what will be done,
 * not an abstraction they would then have to work out the consequences of.
 */
export function DocumentCard({
  item,
  gather,
}: {
  readonly item: BufferItem;
  readonly gather?: {
    readonly collapsed: boolean;
    readonly shift: number;
    readonly index: number;
  };
}) {
  const t = useTranslations("buffer");
  const checkName = useTranslations("capabilities");
  const format = useFormatter();
  const toggleCheck = useBufferStore((state) => state.toggleCheck);
  const remove = useBufferStore((state) => state.remove);
  const openOverlay = useUiStore((state) => state.openOverlay);
  const pressLock = useLockPress();
  const entitlements = useEntitlementsStore((state) => state.entitlements);
  const [confirming, setConfirming] = React.useState(false);
  const [configuring, setConfiguring] = React.useState(false);
  const intake = useIntakeApi();

  // Three states leave a document usable: it read cleanly, some of its pages
  // did not, or the text came out badly and the person has been asked to look
  // at it. Everything else has no text yet, so there is nothing to tick.
  const state = item.extract.state;
  const unreadable = state !== "ready" && state !== "partial" && state !== "suspicious";

  return (
    <m.li
      data-testid="document-card"
      data-doc-id={item.id}
      animate={
        gather?.collapsed ? { opacity: 0, y: -gather.shift } : { opacity: 1, y: 0 }
      }
      transition={{
        ...motionTransition.gather,
        delay:
          gather === undefined || gather.collapsed
            ? 0
            : Math.min(gather.index, 7) * 0.018,
      }}
      className="border-b p-3 last:border-b-0"
    >
      {/* The card is a heading and a body under it: the icon and the name
          across the top, then the volume, the ticks and everything else
          beneath.

          The icon belongs to the heading alone. Indenting the whole card past
          it costs forty-two pixels of every row, which on a phone is a seventh
          of the screen given up so that four checkboxes can line up under a
          name - so below the heading the body takes the full width, and the
          indent returns only where there is width to spare. */}
      <div>
        {/* Centred against the icon rather than hung from its top edge: the
            name is one line, the icon is a square, and aligning their tops
            leaves the word sitting high in a box it should be level with. */}
        <div className="flex items-center gap-2.5">
          <DocumentIcon item={item} />

          {/* In the buffer the name is a real control: there is no other button
              beside it, and it is the only way into the text. */}
          <Button
            type="button"
            variant="link"
            /* Underlined at rest, as it is on the results screen. The name is
               the only way into the text, and a word that looks like a word is
               not offered - a person has to discover it by putting the pointer
               on it, which on a touch screen never happens. */
            className="h-auto min-w-0 flex-1 justify-start p-0 text-left font-mono font-medium break-all text-foreground underline decoration-foreground/25 underline-offset-[3px] hover:decoration-primary"
            onClick={() => openOverlay({ docId: item.id, mode: "edit" })}
          >
            {item.name}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-me-1 -mt-1 shrink-0"
            aria-label={t("remove", { name: item.name })}
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>

        <div className="mt-2 flex min-w-0 flex-col gap-1.5 nav:ps-[2.625rem]">
          <span className="font-mono text-xs text-muted-foreground">
            {unreadable
              ? t(`extract.${state}`)
              : t("volume", {
                  words: format.number(item.extract.words),
                  chars: format.number(item.extract.chars),
                })}
            {item.extract.edited ? ` · ${t("edited")}` : ""}
          </span>

          {/* All four are available on every document without exception: the
              automation decides what to suggest and never what to allow.

              The caption names the row rather than standing beside it: four
              toggles in a row are one question with four answers, and a reader
              who arrives at the third of them by keyboard is told which
              question it belongs to. */}
          <div
            role="group"
            aria-labelledby={`checks-${item.id}`}
            className="flex flex-wrap items-center gap-1.5"
          >
            <span
              id={`checks-${item.id}`}
              className="me-0.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase"
            >
              {t("checkFor")}
            </span>
            {moduleIds.map((module) => {
              const { locked } = lockOf(entitlements, module);
              const checked = !locked && item.checks.includes(module);
              return (
                <button
                  key={module}
                  type="button"
                  aria-pressed={checked}
                  aria-disabled={locked}
                  data-state={checked ? "checked" : "unchecked"}
                  data-locked={locked ? "" : undefined}
                  data-testid={`check-${module}`}
                  aria-label={
                    locked
                      ? t("lockedCheck", { check: checkName(module), name: item.name })
                      : `${checkName(module)} — ${item.name}`
                  }
                  className={cn(
                    // A control on a card takes the card's own control fill, or
                    // it is a border drawn on the card it stands on.
                    "inline-flex h-7 items-center gap-1.5 rounded-sm border bg-control-card px-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-control-card-hover",
                    checked &&
                      "border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft",
                    locked && "opacity-60",
                  )}
                  onClick={() =>
                    locked ? pressLock(module) : toggleCheck(item.id, module, !checked)
                  }
                >
                  <span
                    className={cn(
                      "grid size-3.5 place-items-center rounded-[3px] border-[1.5px] border-current opacity-50",
                      checked &&
                        "border-primary bg-primary text-primary-foreground opacity-100",
                      locked && "border-0 opacity-100",
                    )}
                    aria-hidden="true"
                  >
                    {locked ? (
                      <LockIcon className="size-3" />
                    ) : checked ? (
                      <CheckIcon className="size-2.5 stroke-[3]" />
                    ) : null}
                  </span>
                  {checkName(module)}
                </button>
              );
            })}
            {item.checks.length === 0 && !unreadable ? (
              <span className="text-xs text-muted-foreground">{t("noChecks")}</span>
            ) : null}
          </div>

          {/* Everything a check needs besides the text - its settings and the
              texts it reads - is behind one disclosure on this card, and what
              is chosen there turns up in the plan. It appears once there is a
              check to configure.

              It carries a surface rather than being a ghost: the bibliography,
              the glossary file and the venue's requirements are all brought in
              behind it, so a person who does not notice it runs checks that do
              half their work. */}
          {item.checks.length > 0 && !unreadable ? (
            <div>
              <Button
                type="button"
                variant="outlineOnCard"
                size="sm"
                data-testid="configure"
                aria-expanded={configuring}
                aria-controls={`settings-${item.id}`}
                onClick={() => setConfiguring(!configuring)}
              >
                <SlidersHorizontalIcon aria-hidden="true" />
                {t("configure")}
                <ChevronDownIcon
                  className={cn(
                    "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                    !configuring && "-rotate-90",
                  )}
                  aria-hidden="true"
                />
              </Button>
              <Collapse open={configuring} id={`settings-${item.id}`}>
                <DocumentSettings item={item} />
              </Collapse>
            </div>
          ) : null}

          {/* Outside the condition below, and deliberately: the parse ending
              well is the one outcome that leaves nothing on the card, and it is
              the outcome a person waiting on a screen reader most needs to
              hear. */}
          <ExtractAnnouncement item={item} />

          {/* Whatever extraction has to say about this document, and the ways
              out of it, on the card and for as long as the problem lasts. It
              sits under the ticks rather than over the name, because a document
              that is merely suspicious still has ticks. */}
          {needsNotice(item) && intake !== null ? (
            <ExtractNotice
              item={item}
              {...(intake.progress[item.id] === undefined
                ? {}
                : { progress: intake.progress[item.id] })}
              onRetry={() => void intake.reread(item.id)}
              onUnlock={(password) => void intake.reread(item.id, { password })}
              onChooseAgain={(file) => void intake.chooseAgain(item.id, file)}
              onCancel={() => intake.cancel(item.id)}
              onOpenText={() => openOverlay({ docId: item.id, mode: "edit" })}
            />
          ) : null}

          {/* The plan of this document, under its own ticks and its own
              settings: what will run on it, what the checks will read alongside
              it, and why it will take no part when it will not.

              It carries a boundary of its own because it is the one part of the
              card that is computed rather than shown: what it says is derived
              from the ticks, the attachments and what access is open, and a
              failure in that arithmetic must not take away the name of the
              document or the way into its text. */}
          {unreadable ? null : (
            <ZoneBoundary zone="plan">
              <DocumentPlan item={item} />
            </ZoneBoundary>
          )}
        </div>
      </div>

      {/* Removing a document destroys the only copy of it there is, so it asks
          first, in a dialogue, and says what will go. */}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("removeConfirmTitle")}
        body={t("removeConfirm", { name: item.name })}
        confirmLabel={t("removeConfirmYes")}
        cancelLabel={t("cancel")}
        testId="remove-confirm"
        onConfirm={() => remove(item.id)}
      />
    </m.li>
  );
}
