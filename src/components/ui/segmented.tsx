"use client";

import { type LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * One question with a handful of answers, drawn as one control: a track, and
 * the chosen answer sitting on top of it.
 *
 * The form is the point. A row of separate buttons reads as a row of separate
 * actions - press this one and something happens, press that one and something
 * else does - and which of them is a state has to be worked out from the fills.
 * Set into a single track, the group says at a glance that these are positions
 * of one switch and that exactly one of them is on. It is how the light and
 * dark switch in the header is drawn, and it is what a person has already
 * learnt to read by the time they reach any other switch in the product.
 *
 * Colour is the whole of the difference between the positions and the whole of
 * what hover and press change. Nothing here moves or resizes under the pointer.
 *
 * The theme switch itself does not use this and should not: which of its
 * positions is on is decided in CSS by the same condition the colours are, so
 * that it is already right on the first paint - before any of this has run.
 */
export type SegmentedOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly Icon?: LucideIcon;
  readonly testId?: string;
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** Names the group for a screen reader: the question the positions answer. */
  readonly label: string;
  readonly value: T;
  readonly options: ReadonlyArray<SegmentedOption<T>>;
  readonly onChange: (value: T) => void;
  readonly className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex flex-wrap rounded-md bg-muted p-0.5", className)}
    >
      {options.map(({ value: option, label: text, Icon, testId }) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          data-testid={testId}
          onClick={() => onChange(option)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 font-sans text-xs font-medium text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:text-foreground",
            // The chosen position stands off the track it is set into, the way
            // a key stands off the board it sits in.
            value === option && "bg-card text-foreground shadow-xs",
          )}
        >
          {Icon === undefined ? null : <Icon className="size-3.5" aria-hidden="true" />}
          {text}
        </button>
      ))}
    </div>
  );
}
