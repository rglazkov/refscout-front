import { useTranslations } from "next-intl";

import { AboutChecks } from "@/components/marketing/about-checks";
import { WorkspaceMount } from "@/components/shell/workspace-mount";
import { ZoneBoundary } from "@/components/shell/zone-boundary";
import { site } from "@/lib/brand";
import { type Locale } from "@/lib/i18n";

/**
 * The workspace screen, and the landing page with it: the buffer on top and a
 * short text about the product below.
 *
 * The body of every page lives here rather than in `app/`, because each page
 * exists at two addresses - `/` for the default language and `/{locale}/` for
 * the rest - and a screen written twice is a screen that will differ by the
 * second edit.
 */
export function HomePage({ locale }: { readonly locale: Locale }) {
  const t = useTranslations("workspace");

  return (
    <div className="home-workspace mx-auto max-w-6xl px-4 py-12">
      <div className="workspace-empty-only">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {t("title")}
          </h1>
          {/* The lead is the one paragraph that has to be read, so it keeps a
              measure of its own rather than running the width of the workspace
              column: past roughly sixty characters the eye loses the line it
              came from on the way back. */}
          <p className="mt-3 max-w-[58ch] text-pretty text-muted-foreground">
            {t("lead", { brandName: site.name })}
          </p>
        </div>
      </div>

      {/* The outermost net. The zones inside the workspace carry their own, so
          what reaches this one is a failure of the screen itself rather than of
          any part of it. */}
      <ZoneBoundary zone="workspace">
        <WorkspaceMount />
      </ZoneBoundary>

      <div className="workspace-empty-only">
        <div>
          <AboutChecks locale={locale} />
        </div>
      </div>
    </div>
  );
}
