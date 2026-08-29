import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { FeaturePage } from "@/components/pages/feature";
import { findFeature, listFeatures } from "@/lib/content/features";
import { isLocale, localeParams } from "@/lib/i18n";
import { buildFeatureMetadata } from "@/lib/seo";

type PageProps = {
  readonly params: Promise<{ readonly locale: string; readonly feature: string }>;
};

/**
 * A check is a file, and it is a file per language: a language whose folder
 * does not describe a check gets no page for it, rather than a page in the
 * wrong language.
 */
export function generateStaticParams(): Array<{ locale: string; feature: string }> {
  return localeParams().flatMap(({ locale }) =>
    listFeatures(locale).map((feature) => ({ locale, feature: feature.id })),
  );
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, feature: id } = await params;
  if (!isLocale(locale)) return {};
  const feature = findFeature(id, locale);
  return feature === undefined ? {} : await buildFeatureMetadata(feature, locale);
}

export default async function Page({ params }: PageProps) {
  const { locale, feature: id } = await params;
  if (!isLocale(locale)) notFound();

  setRequestLocale(locale);
  return <FeaturePage locale={locale} id={id} />;
}
