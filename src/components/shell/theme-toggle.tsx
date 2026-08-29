"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { track } from "@/lib/telemetry";
import { chooseTheme, resolveTheme, subscribeToTheme, type Theme } from "@/lib/theme";

/**
 * Two positions: light and dark (M0.2.4). There is no separate "system"
 * position in the toggle - on a first visit whatever the environment says is
 * selected, and until the user touches the toggle the page follows the system.
 *
 * A two-icon segmented control rather than a list: both options are fully
 * visible, the current one can be read without opening anything, and in the
 * header that saves the space a narrow screen does not have.
 *
 * Which position is highlighted is decided by CSS, not by React state: the
 * `dark:` variant matches the same condition as the tokens, so the highlight is
 * already correct on the first paint - before hydration and without a choice
 * being made on the server. The state is needed only for `aria-pressed`, which
 * cannot be expressed in CSS.
 *
 * The hint is a tooltip rather than a `title`: `title` never appears on a touch
 * device, never appears on keyboard focus, and cannot be styled. The bubble is
 * hidden from assistive technology on purpose - the button is already named by
 * the same word, and `title` used to have it announced twice, once as the name
 * and once as the description.
 */
const options: ReadonlyArray<{
  readonly value: Theme;
  readonly Icon: LucideIcon;
  /** How the button looks pressed - it turns on wherever its own theme does. */
  readonly highlight: string;
}> = [
  {
    value: "light",
    Icon: SunIcon,
    highlight:
      "bg-card text-foreground shadow-xs dark:bg-transparent dark:text-muted-foreground dark:shadow-none",
  },
  {
    value: "dark",
    Icon: MoonIcon,
    highlight: "dark:bg-card dark:text-foreground dark:shadow-xs",
  },
];

/** There is no theme on the server; the real one arrives right after hydration. */
function serverTheme(): Theme {
  return "light";
}

export function ThemeToggle() {
  const t = useTranslations("theme");
  const theme = useSyncExternalStore(subscribeToTheme, resolveTheme, serverTheme);

  function change(next: Theme): void {
    chooseTheme(next);
    track("theme_changed", { context: { dark: next === "dark" } });
  }

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex rounded-md bg-muted p-0.5"
    >
      {options.map(({ value, Icon, highlight }) => (
        <Tooltip key={value}>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={theme === value}
              onClick={() => {
                change(value);
              }}
              className={cn(
                "grid size-6 place-items-center rounded-sm text-muted-foreground transition-colors nav:size-7",
                "hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:text-foreground",
                highlight,
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{t(value)}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent aria-hidden="true">{t(value)}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
