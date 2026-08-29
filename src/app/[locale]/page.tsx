import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { HomePage } from "@/components/pages/home";
import { isLocale } from "@/lib/i18n";

type PageProps = { readonly params: Promise<{ readonly locale: string }> };

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  setRequestLocale(locale);
  return <HomePage locale={locale} />;
}
