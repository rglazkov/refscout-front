import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { PricingPage } from "@/components/pages/pricing";
import { isLocale } from "@/lib/i18n";
import { buildMetadata } from "@/lib/seo";

type PageProps = { readonly params: Promise<{ readonly locale: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  return isLocale(locale) ? buildMetadata("pricing", locale) : {};
}

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  setRequestLocale(locale);
  return <PricingPage />;
}
