import ReactDOM from "react-dom";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { MAIN_ID, SkipLink } from "@/components/shell/skip-link";
import { ZoneBoundary } from "@/components/shell/zone-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { shellMessages, type Locale } from "@/lib/i18n";
import { publicPath } from "@/lib/public-path";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * The document every page is served inside. It exists as a component rather
 * than as one root layout because there are two of those: the default language
 * is served from `/` and the rest from a `/{locale}` prefix, which in a static
 * export means two trees under `app/` - and `lang` on <html> differs between
 * them.
 *
 * The fonts are vendored in `public/fonts` and declared in `src/app/fonts.css`;
 * nothing is fetched from a third-party host, which is also a CSP requirement.
 * Only the Latin slices are preloaded - the Latin-Extended and Cyrillic ones
 * are fetched by the browser when a page actually contains those characters.
 */
const PRELOADED_FONTS = [
  "inter-latin-wght-normal",
  // Literata varies by optical size rather than by weight, so its slices are
  // named for that axis. A name that matches no file preloads nothing: the
  // request 404s, the face is fetched later from the stylesheet, and the page
  // shows the fallback serif for exactly as long as the preload existed to
  // prevent. The names are checked against the folder in `fonts.test.ts`.
  "literata-latin-opsz-normal",
  "jetbrains-mono-latin-wght-normal",
];

type SiteDocumentProps = {
  readonly locale: Locale;
  readonly children: React.ReactNode;
};

export async function SiteDocument({ locale, children }: SiteDocumentProps) {
  for (const file of PRELOADED_FONTS) {
    ReactDOM.preload(publicPath(`/fonts/${file}.woff2`), {
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
            first paint, or a dark page flashes light. Its hash goes into
            script-src during the post-build step. */}
        <script>{THEME_INIT_SCRIPT}</script>
      </head>
      <body className="min-h-svh">
        {/* The shell's own words and no more. What the working screen says -
            the cards, the findings, every refusal the server can give - is
            most of the dictionary and none of this page, so it arrives with
            that screen instead of being written into the HTML of every
            address here. */}
        <NextIntlClientProvider messages={shellMessages(messages)}>
          <TooltipProvider>
            <div className="flex min-h-svh flex-col">
              <SkipLink />
              <ZoneBoundary zone="shell">
                <SiteHeader locale={locale} />
              </ZoneBoundary>
              {/* Focusable, so that following the link above actually moves
                  the focus rather than only the scroll position. */}
              <main id={MAIN_ID} tabIndex={-1} className="flex-1 outline-none">
                {children}
              </main>
              <SiteFooter locale={locale} />
            </div>
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
