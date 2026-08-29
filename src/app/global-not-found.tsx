import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { NotFoundPage } from "@/components/pages/not-found";
import { SiteFooter } from "@/components/shell/site-footer";
import { Logo, site } from "@/lib/brand";
import { defaultLocale } from "@/lib/i18n";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

import "./globals.css";

/**
 * The document the host serves for an address that matched nothing, written to
 * `out/404.html`.
 *
 * It is a `global-not-found`, which means it renders the whole document -
 * <html>, <head> and <body> - rather than being wrapped in a layout. It has to:
 * it sits outside the `[locale]` tree, because that is where a static export
 * takes 404.html from, and a page outside every root layout would otherwise be
 * wrapped in the one Next supplies. That one carries no
 * `suppressHydrationWarning`, so the theme attribute the inline script writes
 * before the first paint arrives as a hydration mismatch on every 404.
 *
 * Nothing on it is interactive, and that is the point. Rendering the real
 * header here means a second client entry - the providers, the theme toggle,
 * the menu popover - and Next puts that in a chunk every other page then
 * downloads: measured, 4.4 kB on every visit to pay for a page almost nobody
 * reaches. So the mark is a plain link, and the two controls the header would
 * have carried are a tap away on the page it leads to.
 *
 * The language is the default one: an address that matched no route has no
 * segment to read a locale from, and asking the request for one is what turns a
 * page dynamic (§2).
 */
export default async function GlobalNotFound() {
  setRequestLocale(defaultLocale);
  const t = await getTranslations("nav");

  return (
    <html lang={defaultLocale} suppressHydrationWarning>
      <head>
        {/* Ahead of the first paint - without it a dark 404 flashes light
            (M0.2.3). Its hash reaches script-src the same way every other
            page's does. */}
        <script>{THEME_INIT_SCRIPT}</script>
      </head>
      <body className="min-h-svh">
        <div className="flex min-h-svh flex-col">
          <header className="border-b border-border">
            <div className="mx-auto flex h-14 max-w-6xl items-center px-3 nav:px-4">
              <Link
                href="/"
                className="flex items-center gap-2 font-semibold tracking-tight"
              >
                <Logo
                  className="size-5 text-primary"
                  title={t("home", { brandName: site.name })}
                />
                <span>{site.name}</span>
              </Link>
            </div>
          </header>
          <main className="flex-1">
            <NotFoundPage locale={defaultLocale} />
          </main>
          <SiteFooter locale={defaultLocale} />
        </div>
      </body>
    </html>
  );
}
