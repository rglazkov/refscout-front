import { PageContent } from "@/components/marketing/page-content";
import { type Locale } from "@/lib/i18n";

export function PrivacyPage({ locale }: { readonly locale: Locale }) {
  return <PageContent route="/privacy/" titleKey="privacy" locale={locale} />;
}
