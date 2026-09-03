import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { FeatureCards } from "@/components/marketing/feature-cards";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/brand";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";
import { JsonLd, softwareApplicationJsonLd } from "@/lib/seo/json-ld";

/**
 * The list of checks. This is not where a tool is picked: the page explains
 * that checks are offered on the strength of the documents brought in, and
 * lets each one be read about separately - without turning into a shop window
 * of tools.
 */
export async function FeaturesPage({ locale }: { readonly locale: Locale }) {
  const t = await getTranslations("features");

  return (
    <div
      data-region="reading"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"
    >
      {/* The same declaration the start page carries: this address describes
          the product too, by listing what it is made of. */}
      <JsonLd data={await softwareApplicationJsonLd(locale)} />

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-bold tracking-display text-balance">
          {t("title", { brandName: site.name })}
        </h1>
        <p className="max-w-[60ch] text-lg text-muted-foreground">
          {t("lead", { brandName: site.name })}
        </p>
      </div>

      <p className="max-w-[66ch] text-lg leading-[1.72]">
        {t("intro", { brandName: site.name })}
      </p>

      <FeatureCards locale={locale} />

      <Button asChild className="self-start">
        <Link href={localizedPath("/", locale)}>{t("openWorkspace")}</Link>
      </Button>
    </div>
  );
}
