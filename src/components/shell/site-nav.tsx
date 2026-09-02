"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, ShieldIcon, DollarSignIcon, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { defaultLocale, isLocale } from "@/lib/i18n";
import { localizedPath, routes, type RouteId } from "@/lib/seo";

/**
 * The header items in two renderings of one list: as a row while it fits, and
 * behind a menu button once it does not (the `nav` breakpoint, 45rem).
 *
 * The items do not disappear on a narrow screen, they move: a section that
 * cannot be reached from a phone simply does not exist for half of the
 * visitors. The disclosure is handled by the popover primitive, which keeps
 * aria-expanded, focus, Escape and outside-click dismissal on its own.
 */
const items: ReadonlyArray<{ readonly id: RouteId; readonly Icon: LucideIcon }> = [
  { id: "features", Icon: ShieldIcon },
  { id: "pricing", Icon: DollarSignIcon },
];

function useItems() {
  const pathname = usePathname();
  const active = useLocale();
  const locale = isLocale(active) ? active : defaultLocale;

  return items.flatMap(({ id, Icon }) => {
    const route = routes.find((candidate) => candidate.id === id);
    if (route === undefined) return [];
    const href = localizedPath(route.path, locale);
    return [{ id, Icon, href, current: pathname === href }];
  });
}

/** The row of items: visible while there is width for it. */
export function SiteNavLinks() {
  const t = useTranslations("nav");
  const resolved = useItems();

  return (
    <nav className="ms-2 me-auto hidden items-center gap-1 nav:flex">
      {resolved.map(({ id, href, current }) => (
        <Link
          key={id}
          href={href}
          aria-current={current ? "page" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-sm font-medium text-nav-foreground transition-colors",
            // A press response is needed separately from hover: in Tailwind 4
            // hover lives under @media (hover: hover) and does not exist at all
            // on a touch device.
            "hover:bg-accent-bg hover:text-foreground active:bg-accent-bg active:text-foreground",
            current && "bg-primary-soft font-semibold text-primary",
          )}
        >
          {t(id)}
        </Link>
      ))}
    </nav>
  );
}

/** The same items behind a button: shown once the row no longer fits. */
export function SiteNavMenu() {
  const t = useTranslations("nav");
  const resolved = useItems();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          // The trigger takes its hover state and keeps it while the panel is
          // open, so the button and what came out of it read as one thing.
          className="size-8 data-[state=open]:bg-accent-bg nav:hidden"
          aria-label={t("menu")}
        >
          <MenuIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1.5">
        <ul>
          {resolved.map(({ id, Icon, href, current }) => (
            <li key={id}>
              <Link
                href={href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-2 py-2 text-sm transition-colors",
                  "hover:bg-accent-bg active:bg-accent-bg",
                  current && "bg-primary-soft font-semibold text-primary",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {t(id)}
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
