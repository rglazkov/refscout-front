"use client";

import { CheckIcon, LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { type ModuleId } from "@/lib/domain";

/**
 * One check, ticked or not, on one document. It is a pressed button rather than
 * a checkbox because the whole chip is the target: a name with a small box in
 * front of it, and a press anywhere on the name answers the same question.
 *
 * It is drawn in the same way wherever checks are chosen - on the document's
 * card before the first run and in the dialogue that adds checks to the results
 * - because it is the same question in both places.
 */
export function CheckToggle({
  module,
  documentName,
  checked,
  locked,
  onToggle,
  onLocked,
}: {
  readonly module: ModuleId;
  readonly documentName: string;
  readonly checked: boolean;
  readonly locked: boolean;
  readonly onToggle: (checked: boolean) => void;
  readonly onLocked: () => void;
}) {
  const t = useTranslations("buffer");
  const checkName = useTranslations("capabilities");
  const shown = checked && !locked;

  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-disabled={locked}
      data-state={shown ? "checked" : "unchecked"}
      data-locked={locked ? "" : undefined}
      data-testid={`check-${module}`}
      aria-label={
        locked
          ? t("lockedCheck", { check: checkName(module), name: documentName })
          : `${checkName(module)} — ${documentName}`
      }
      className={cn(
        // A control on a card takes the card's own control fill, or it is a
        // border drawn on the card it stands on.
        "inline-flex h-7 items-center gap-1.5 rounded-sm border bg-control-card px-2 text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:bg-control-card-hover",
        shown && "border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft",
        locked && "opacity-60",
      )}
      onClick={() => (locked ? onLocked() : onToggle(!shown))}
    >
      <span
        className={cn(
          "grid size-3.5 place-items-center rounded-[3px] border-[1.5px] border-current opacity-50",
          shown && "border-primary bg-primary text-primary-foreground opacity-100",
          locked && "border-0 opacity-100",
        )}
        aria-hidden="true"
      >
        {locked ? (
          <LockIcon className="size-3" />
        ) : shown ? (
          <CheckIcon className="size-2.5 stroke-[3]" />
        ) : null}
      </span>
      {checkName(module)}
    </button>
  );
}
