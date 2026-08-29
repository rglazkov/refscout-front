import Link from "next/link";
import { useTranslations } from "next-intl";

import { site } from "@/lib/brand";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

/**
 * The notice carries no year. There is no server here: the pages are built
 * once and served as files, so a year rendered from the clock is the year of
 * the build, and the site would go on claiming it until somebody happened to
 * rebuild. A notice without a year is complete as it stands, and it cannot go
 * stale.
 */
export function SiteFooter({ locale }: { readonly locale: Locale }) {
  const t = useTranslations("footer");

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">
        <span>{t("rights", { brandName: site.name })}</span>
        <Link className="hover:text-foreground" href={localizedPath("/privacy/", locale)}>
          {t("privacy")}
        </Link>
        <a className="hover:text-foreground" href={`mailto:${site.supportEmail}`}>
          {t("support")}
        </a>
      </div>
    </footer>
  );
}
