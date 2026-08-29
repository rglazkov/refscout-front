import ReactDOM from "react-dom";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { ZoneBoundary } from "@/components/shell/zone-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type Locale } from "@/lib/i18n";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * The document every page is served inside. It exists as a component rather
 * than as one root layout because there are two of those: the default language
 * is served from `/` and the rest from a `/{locale}` prefix (§3), which in a
 * static export means two trees under `app/` - and `lang` on <html> differs
 * between them.
 *
 * The fonts are vendored in `public/fonts` and declared in `src/app/fonts.css`
 * (M0.9.5); nothing is fetched from a third-party host, which is also a CSP
 * requirement (M0.7). Only the Latin slices are preloaded - the Latin-Extended
 * and Cyrillic ones are fetched by the browser when a page actually contains
 * those characters.
 */
const PRELOADED_FONTS = [
  "inter-latin-wght-normal",
  "literata-latin-wght-normal",
  "jetbrains-mono-latin-wght-normal",
];

type SiteDocumentProps = {
  readonly locale: Locale;
  readonly children: React.ReactNode;
};

export async function SiteDocument({ locale, children }: SiteDocumentProps) {
  for (const file of PRELOADED_FONTS) {
    ReactDOM.preload(`/fonts/${file}.woff2`, {
      as: "font",
      type: "font/woff2",
      crossOrigin: "anonymous",
    });
  }

  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-head-element --
          the rule is about the pages router; in the app router this is how a
          root layout puts something in <head>, and next/head does not exist
          here. */}
      <head>
        {/* The project's only inline script: it applies the theme before the
            first paint, or a dark page flashes light (M0.2.3). Its hash goes
            into script-src during the post-build step (M0.7). */}
        <script>{THEME_INIT_SCRIPT}</script>
      </head>
      <body className="min-h-svh">
        <NextIntlClientProvider messages={messages}>
          <TooltipProvider>
            <div className="flex min-h-svh flex-col">
              <ZoneBoundary zone="shell">
                <SiteHeader locale={locale} />
              </ZoneBoundary>
              <main className="flex-1">{children}</main>
              <SiteFooter locale={locale} />
            </div>
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
