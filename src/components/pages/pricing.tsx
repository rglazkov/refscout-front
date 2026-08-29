import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { site } from "@/lib/brand";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

const planItems = [
  "scout",
  "cite",
  "bibcheck",
  "presubmit",
  "glossary",
  "diffchecker",
  "download",
] as const;

/**
 * Pricing is not a long text but a single card, so the page is assembled from
 * components rather than from a file in content/: its strings live in the
 * dictionary like the rest of the interface text.
 */
export async function PricingPage({ locale }: { readonly locale: Locale }) {
  const t = await getTranslations("pricing");
  const item = await getTranslations("pricingPlan");

  return (
    <div
      data-region="reading"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl leading-tight font-bold tracking-display text-balance">
          {t("title")}
        </h1>
        <p className="max-w-[60ch] text-lg text-muted-foreground">
          {t("lead", { brandName: site.name })}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-3 rounded-xl border border-primary/40 bg-card p-6 font-sans shadow-sm">
        <span className="self-start rounded-sm border border-primary/35 bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">
          {t("badge")}
        </span>

        <div>
          <p className="text-lg font-semibold">{t("planName")}</p>
          <p className="text-3xl leading-none font-bold tracking-tight text-primary">
            {t("price")}
          </p>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">{t("planNote")}</p>

        <ul className="ms-4 flex list-disc flex-col gap-1.5 text-sm">
          {planItems.map((id) => (
            <li key={id} className="ps-1">
              {item(id)}
            </li>
          ))}
        </ul>

        <Button asChild className="mt-1 self-start">
          <Link href={localizedPath("/", locale)}>
            {t("cta", { brandName: site.name })}
          </Link>
        </Button>
      </div>

      <p className="mx-auto max-w-[36rem] text-center text-sm text-muted-foreground">
        {t("footnote")}
      </p>
    </div>
  );
}
