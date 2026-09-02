import Link from "next/link";
import { useTranslations } from "next-intl";

import { SiteNavLinks, SiteNavMenu } from "@/components/shell/site-nav";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { Logo, site } from "@/lib/brand";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

/**
 * Features and Pricing, plus the theme toggle and the account entry. There are
 * no per-tool tabs here and none will appear at any stage: the product is one
 * checker with several built-in capabilities, not a row of separate tools.
 *
 * The tint is thin enough that cards and body text read through it, and it is
 * not the same in both themes. What passes under the header is dark text on a
 * light ground in the light theme and light text on a dark ground in the dark
 * one, so it collides with the header's own links from opposite directions.
 * The light theme buys its transparency by darkening the links
 * (`--nav-foreground`); the dark theme keeps a denser tint, because its links
 * cannot be lightened much further without turning into body text. How dense
 * it may be is not a matter of taste: the desktop test measures the pixels
 * actually behind the letters at every scroll position and holds the ratio at
 * AA, so this number is lowered until that test is the thing that stops it.
 */
export function SiteHeader({ locale }: { readonly locale: Locale }) {
  const t = useTranslations("nav");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/20 backdrop-blur-md dark:bg-background/35">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 nav:gap-4 nav:px-4">
        <Link
          href={localizedPath("/", locale)}
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <Logo
            className="size-5 text-primary"
            title={t("home", { brandName: site.name })}
          />
          <span>{site.name}</span>
        </Link>

        <SiteNavLinks />

        {/* The language switcher belongs here, beside the theme. It is not
            mounted while there is one language: a menu with a single row is a
            control that asks a question with one answer. The parts it needs are
            in place - the locale list, `unlocalizedPath` and its words in the
            dictionary - so it arrives with the second language rather than
            before it. */}
        <div className="ms-auto flex items-center gap-1.5 nav:gap-2">
          <SiteNavMenu />
          <ThemeToggle />
          <Button asChild variant="outline" size="sm" className="h-8 nav:h-9">
            <Link href={localizedPath("/account/", locale)}>{t("signIn")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
