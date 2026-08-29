"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { track } from "@/lib/telemetry";

type BlockedButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "disabled" | "onClick" | "className"
> & {
  /** Why the action cannot run. Shown when the button is pressed. */
  readonly reason: string;
  /**
   * Which control this is, for telemetry. A static identifier such as
   * `intake.choose` - never anything taken from a document or typed by a person.
   */
  readonly action: string;
  /** Classes for the wrapper: the button fills whatever width it is given. */
  readonly className?: string;
};

/**
 * A button for an action that cannot run yet.
 *
 * There are no disabled buttons in this product (§14). A `disabled` one is
 * removed from the tab order, gives no answer when it is pressed, and reports
 * nothing to us - so a person who cannot tell why nothing happens is left
 * guessing, and we never learn that they tried. This one stays focusable,
 * announces itself as unavailable through `aria-disabled`, says why when it is
 * pressed, and records the attempt.
 *
 * The reason appears in a live region, so it reaches a screen reader as well as
 * the screen: pressing a button and having text appear silently somewhere below
 * it is the same dead end for anyone not watching that spot.
 */
export function BlockedButton({
  reason,
  action,
  className,
  children,
  ...props
}: BlockedButtonProps) {
  const [explained, setExplained] = React.useState(false);

  return (
    <span className={cn("inline-flex flex-col gap-2", className)}>
      <Button
        {...props}
        aria-disabled="true"
        className="w-full"
        onClick={(event) => {
          // The control is real enough to be pressed, so a form around it must
          // still not act on the press.
          event.preventDefault();
          setExplained(true);
          track("blocked_click", { code: `ACTION_BLOCKED:${action}` });
        }}
      >
        {children}
      </Button>
      <span role="status" className="text-xs text-muted-foreground">
        {explained ? reason : null}
      </span>
    </span>
  );
}
