import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { FeatureIcon } from "@/components/marketing/feature-icon";
import { cn } from "@/lib/cn";
import { listFeatures } from "@/lib/content/features";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

/**
 * The check cards. The list comes from the files in content/{locale}/features:
 * add a file and both a card and a page appear, delete it and both are gone.
 *
 * The name and description come from the file's front matter, and failing that
 * from the dictionary: adding a check stays a single action, while the names of
 * checks already described go on living where the rest of the interface text
 * lives.
 */
export async function FeatureCards({ locale }: { readonly locale: Locale }) {
  const t = await getTranslations("features");
  const features = listFeatures(locale);

  return (
    <ul className="grid gap-3 font-sans sm:grid-cols-2">
      {features.map((feature) => (
        <li key={feature.id} className="flex">
          <Link
            href={localizedPath(feature.path, locale)}
            className={cn(
              "flex flex-1 flex-col gap-1.5 rounded-xl border border-border bg-card p-4",
              "shadow-sm transition-colors",
              // Hover and press change the colour of the border, never its
              // width: the card keeps the same hairline it draws at rest.
              "hover:border-primary active:border-primary",
            )}
          >
            <span className="flex items-center gap-1.5 text-lg font-semibold">
              <FeatureIcon name={feature.icon} className="size-4 text-primary" />
              {feature.name}
            </span>
            <span className="text-sm leading-relaxed text-muted-foreground">
              {feature.summary}
            </span>
            <span className="mt-0.5 text-xs font-semibold text-primary">
              {t("readMore")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
