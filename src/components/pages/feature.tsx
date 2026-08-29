import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { findFeature } from "@/lib/content/features";
import { contentNameFor, loadPageBody } from "@/lib/content/pages";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

type FeaturePageProps = {
  readonly locale: Locale;
  /** The slug from the address, which is the name of the description file. */
  readonly id: string;
};

export async function FeaturePage({ locale, id }: FeaturePageProps) {
  const feature = findFeature(id, locale);
  if (feature === undefined) notFound();

  const t = await getTranslations("features");
  const page = await getTranslations("page");
  const Body = await loadPageBody(contentNameFor(feature.path), locale);

  return (
    <div
      data-region="reading"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"
    >
      <Button asChild variant="ghost" size="sm" className="-ms-2 self-start">
        <Link href={localizedPath("/features/", locale)}>
          <ArrowLeftIcon aria-hidden="true" />
          {t("back")}
        </Link>
      </Button>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-bold tracking-display text-balance">
          {feature.title ?? feature.name}
        </h1>
        <p className="max-w-[60ch] text-lg text-muted-foreground">
          {feature.description ?? feature.summary}
        </p>
      </div>

      {Body === null ? (
        <p className="rounded-lg border border-border bg-card p-4 font-sans text-sm text-muted-foreground">
          {page("pending")}
        </p>
      ) : (
        <div>
          <Body />
        </div>
      )}

      <Button asChild className="self-start">
        <Link href={localizedPath("/", locale)}>{t("openWorkspace")}</Link>
      </Button>
    </div>
  );
}
