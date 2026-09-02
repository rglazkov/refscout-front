import Link from "next/link";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { site } from "@/lib/brand";
import { listFeatures } from "@/lib/content/features";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

/**
 * A short block about the product at the bottom of the workspace screen. It
 * lives outside features/ and renders statically: that is the only way to keep
 * it in the HTML under the dynamic loading rule - and without HTML this text is
 * invisible to search engines and pointless.
 */
export function AboutChecks({ locale }: { readonly locale: Locale }) {
  const features = listFeatures(locale);
  const t = useTranslations("workspace.about");

  return (
    <section className="mt-12 border-t border-border pt-8">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        {t("title", { brandName: site.name })}
      </h2>
      {/* The columns come from the width available rather than from a
          breakpoint, so the block fills the workspace column instead of
          leaving half of it empty on a wide screen. */}
      <ul className="-mx-2 mt-4 grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-x-6">
        {features.map(({ id, path, name, summary }) => (
          <li key={id}>
            <Link
              href={localizedPath(path, locale)}
              className={cn(
                "block rounded-md px-2 py-1.5 transition-colors",
                "hover:bg-accent-bg active:bg-accent-bg",
              )}
            >
              <span className="block text-sm font-semibold">{name}</span>
              <span className="block text-xs leading-normal text-muted-foreground">
                {summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-muted-foreground">
        {t("footnote")}{" "}
        <Link
          className="text-primary hover:underline"
          href={localizedPath("/features/", locale)}
        >
          {t("seeAll")}
        </Link>
      </p>
    </section>
  );
}
