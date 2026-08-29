"use client";

import * as React from "react";
import {
  CheckIcon,
  FileTextIcon,
  LibraryIcon,
  LockIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { m } from "motion/react";

import { motionTransition } from "@/components/motion/transitions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { forgetDocument } from "@/lib/docs";
import { type BufferItem, moduleIds } from "@/lib/domain";
import { useBufferStore, useEntitlementsStore, useUiStore } from "@/stores";

import { VenueDialog } from "./venue-dialog";

/**
 * One document in the buffer (M1.4.1). A type icon, the name - which opens the
 * text - the volume in words and characters, four checkboxes named the way the
 * product names its checks, a button for the venue's requirements and one to
 * remove the document.
 *
 * There is no "document role" on screen. The person is shown what will be done,
 * not an abstraction they would then have to work out the consequences of (§4).
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
  const openPaywall = useUiStore((state) => state.openPaywall);
  const entitlements = useEntitlementsStore((state) => state.entitlements);
  const [confirming, setConfirming] = React.useState(false);

  const unreadable = item.extract.state !== "ready" && item.extract.state !== "partial";

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
      <div className="flex items-start gap-2">
        <Icon item={item} />

        {/* In the buffer the name is a real control: there is no other button
            beside it, and it is the only way into the text (§9). */}
        <Button
          type="button"
          variant="link"
          className="h-auto min-w-0 flex-1 justify-start p-0 text-left font-medium break-all text-foreground"
          onClick={() => openOverlay({ docId: item.id, mode: "edit" })}
        >
          {item.name}
        </Button>

        <span className="shrink-0 font-mono text-xs text-muted-foreground">
          {unreadable
            ? t(`extract.${item.extract.state}`)
            : t("volume", {
                words: format.number(item.extract.words),
                chars: format.number(item.extract.chars),
              })}
          {item.extract.edited ? ` · ${t("edited")}` : ""}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("remove", { name: item.name })}
          onClick={() => setConfirming(true)}
        >
          <Trash2Icon aria-hidden="true" />
        </Button>
      </div>

      {/* All four are available on every document without exception: the
          automation decides what to suggest and never what to allow (§4). */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 ps-10">
        <span className="me-0.5 text-[0.6875rem] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {t("checkFor")}
        </span>
        {moduleIds.map((module) => {
          const locked = entitlements?.modules[module].allowed === false;
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
              aria-label={`${checkName(module)} — ${item.name}`}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-sm border bg-card px-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-accent-bg",
                checked &&
                  "border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft",
                locked && "opacity-60",
              )}
              onClick={() =>
                locked ? openPaywall(module) : toggleCheck(item.id, module, !checked)
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

      {item.checks.includes("presubmit") ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 ps-10 text-xs text-muted-foreground">
          <span className="font-semibold tracking-[0.06em] uppercase">
            {t("venueLabel")}
          </span>
          <VenueDialog item={item} />
        </div>
      ) : null}

      {item.venue === undefined || item.venue.state === "ready" ? null : (
        <p className="mt-2 ps-10 text-xs text-muted-foreground" data-testid="venue-line">
          {t("venueLine", { source: item.venue.source })}
          {item.venue.state === "loading" ? ` · ${t("venue.loading")}` : ""}
          {item.venue.state === "not-requirements"
            ? ` · ${t("venue.notRequirements")}`
            : ""}
          {item.venue.state === "failed" ? ` · ${t("venue.failed")}` : ""}
          {item.venue.state === "timeout" ? ` · ${t("venue.timeout")}` : ""}
        </p>
      )}

      {/* Removing a document destroys the only copy of it there is, so it asks
          first and says what will go (§4). */}
      {confirming ? (
        <div
          role="alertdialog"
          aria-label={t("removeConfirmTitle")}
          className="mt-3 rounded-lg border border-critical-border bg-critical-soft p-3 text-sm"
        >
          <p>{t("removeConfirm", { name: item.name })}</p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                forgetDocument(item.id);
                remove(item.id);
              }}
            >
              {t("removeConfirmYes")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirming(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </m.li>
  );
}

function Icon({ item }: { readonly item: BufferItem }) {
  const className = "size-4";
  const wrap = (icon: React.ReactNode, tone = "bg-muted text-muted-foreground") => (
    <span
      className={`grid size-8 shrink-0 place-items-center rounded-md ${tone}`}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
  if (item.extract.state !== "ready" && item.extract.state !== "partial") {
    return wrap(
      <TriangleAlertIcon className={className} />,
      "bg-critical-soft text-critical",
    );
  }
  if (item.detected === "bibtex") return wrap(<LibraryIcon className={className} />);
  if (item.origin === "typed") return wrap(<PencilIcon className={className} />);
  return wrap(<FileTextIcon className={className} />);
}
