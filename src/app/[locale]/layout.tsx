import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { brand } from "../../../brand.config";
import { SiteDocument } from "@/components/shell/site-document";
import { site } from "@/lib/brand";
import { isLocale, localeParams } from "@/lib/i18n";
import { buildMetadata } from "@/lib/seo";

import "../globals.css";

type LayoutProps = {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly locale: string }>;
};

/**
 * The root layout of every language other than the default one, which is served
 * from `/` by the sibling tree (§3). The folders come out of the list of
 * languages at build time, so adding a language is an entry in
 * `src/lib/i18n/routing.ts` and a dictionary beside it - not a new route.
 *
 * The default language is deliberately absent from these params: it already has
 * pages at the root, and generating it here as well would publish every page at
 * two addresses.
 */
export function generateStaticParams(): Array<{ locale: string }> {
  return localeParams();
}

export const dynamicParams = false;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: brand.themeColor.light },
    { media: "(prefers-color-scheme: dark)", color: brand.themeColor.dark },
  ],
};

export async function generateMetadata({
  params,
}: Omit<LayoutProps, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const metadata = await buildMetadata("home", locale);
  return { ...metadata, metadataBase: new URL(site.url) };
}

export default async function LocaleLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  setRequestLocale(locale);
  return <SiteDocument locale={locale}>{children}</SiteDocument>;
}
