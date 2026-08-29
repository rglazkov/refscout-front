"use client";

import * as React from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { m } from "motion/react";

import { motionTransition } from "@/components/motion/transitions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { clearAllDocuments } from "@/lib/docs";
import { submittableItems, totalChars, useBufferStore, useUiStore } from "@/stores";

import { DocumentCard } from "./document-card";

/**
 * The buffer: its heading, its two counters, and the list (§4).
 *
 * The heading counts two things in two sentences. "In the buffer" and "Will be
 * sent" diverge the moment a document fails to parse or has its last tick
 * removed, and one number here would mean different things on adjacent lines
 * (M1.4.9).
 */
export function BufferList() {
  const t = useTranslations("buffer");
  const format = useFormatter();
  const items = useBufferStore((state) => state.items);
  const clear = useBufferStore((state) => state.clear);
  const collapsed = useUiStore((state) => state.docListCollapsed);
  const setCollapsed = useUiStore((state) => state.setDocListCollapsed);
  const heading = React.useRef<HTMLButtonElement | null>(null);
  const list = React.useRef<HTMLUListElement | null>(null);
  const [gatherShifts, setGatherShifts] = React.useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const [confirmingClear, setConfirmingClear] = React.useState(false);

  const sending = submittableItems(items);

  // A folded buffer opens itself when a document is added: otherwise dragging a
  // file in looks like nothing happened, and the next thing the person does is
  // drop it a second time (§4).
  const count = items.length;
  const previous = React.useRef(count);
  React.useEffect(() => {
    if (count > previous.current) setCollapsed(false);
    previous.current = count;
  }, [count, setCollapsed]);

  const foldList = () => {
    const rows = Array.from(
      list.current?.querySelectorAll<HTMLElement>("[data-doc-id]") ?? [],
    );
    const firstTop = rows[0]?.getBoundingClientRect().top ?? 0;
    setGatherShifts(
      new Map(
        rows.map((row) => [
          row.dataset.docId ?? "",
          row.getBoundingClientRect().top - firstTop,
        ]),
      ),
    );
    setCollapsed(true);
  };

  if (items.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="buffer-heading">
      <div className="flex items-center justify-between gap-3">
        {/* The caret and the word are one button, so the target is the size of
            the word rather than the size of the icon (§4). */}
        <Button
          ref={heading}
          id="buffer-heading"
          type="button"
          variant="ghost"
          size="sm"
          className="-ms-1.5 h-auto gap-1.5 px-1.5 py-0.5 text-[1.375rem] font-semibold tracking-[-0.01em]"
          aria-expanded={!collapsed}
          aria-controls="buffer-list"
          onClick={() => (collapsed ? setCollapsed(false) : foldList())}
        >
          <ChevronDownIcon
            className={cn(
              "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
              collapsed && "-rotate-90",
            )}
            aria-hidden="true"
          />
          {t("heading")}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirmingClear(true)}
        >
          {t("clearAll")}
        </Button>
      </div>

      {/* The counters stay outside the button. They are the last numbers read
          before sending, they get selected and copied, and inside the button
          they would become part of its name - which would then change with
          every tick (§4). */}
      <p className="mt-1 ps-5 text-sm text-muted-foreground" data-testid="buffer-counts">
        {t("inBuffer", {
          documents: items.length,
          chars: format.number(totalChars(items)),
        })}
      </p>
      <p className="ps-5 text-sm text-muted-foreground" data-testid="sending-counts">
        {t("willSend", {
          documents: sending.length,
          chars: format.number(totalChars(sending)),
        })}
      </p>

      {confirmingClear ? (
        <div
          role="alertdialog"
          aria-label={t("clearConfirmTitle")}
          className="mt-3 rounded-lg border border-critical-border bg-critical-soft p-3 text-sm"
        >
          <p>{t("clearConfirm", { documents: items.length })}</p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => {
                clearAllDocuments();
                clear();
                setConfirmingClear(false);
              }}
            >
              {t("clearConfirmYes")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmingClear(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      {collapsed ? (
        /* A folded list leaves a spine. Without it the screen says "5 documents
           in the buffer" and shows none, which reads as documents having gone
           missing rather than as a list being folded (§4). */
        <div className="relative mt-3">
          <button
            type="button"
            data-testid="buffer-spine"
            aria-expanded={false}
            aria-controls="buffer-list"
            className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-start text-sm hover:bg-accent-bg"
            onClick={() => {
              setCollapsed(false);
              // Unfolding from the spine removes the spine, so the focus is
              // handed to the heading: it controls the same list and stays.
              heading.current?.focus();
            }}
          >
            <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />
            <span className="shrink-0 font-medium">
              {t("spineCount", { documents: items.length })}
            </span>
            <span className="hidden min-w-0 flex-1 truncate text-muted-foreground nav:inline">
              {items
                .slice(0, 3)
                .map((item) => item.name)
                .join(", ")}
              {items.length > 3 ? ` +${items.length - 3}` : ""}
            </span>
            <span className="ms-auto shrink-0 font-semibold text-primary">
              {t("show")}
            </span>
          </button>
          <div
            className="mx-2 h-1 rounded-b-lg border-x border-b bg-card"
            aria-hidden="true"
          />
          <div
            className="mx-4 h-1 rounded-b-lg border-x border-b bg-card"
            aria-hidden="true"
          />
        </div>
      ) : null}

      <m.ul
        ref={list}
        id="buffer-list"
        initial={false}
        animate={{ height: collapsed ? 0 : "auto" }}
        transition={motionTransition.gather}
        aria-hidden={collapsed}
        inert={collapsed}
        className="mt-3 overflow-hidden rounded-xl border bg-card shadow-sm"
      >
        {items.map((item, index) => (
          <DocumentCard
            key={item.id}
            item={item}
            gather={{
              collapsed,
              shift: gatherShifts.get(item.id) ?? 0,
              index,
            }}
          />
        ))}
      </m.ul>

      <p className="mt-2 text-xs text-muted-foreground">{t("nameOpensText")}</p>
    </section>
  );
}
