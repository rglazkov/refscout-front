import Link from "next/link";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

/**
 * The address that answers to nothing. It says what happened and offers the
 * way back, in the same column and the same reading face as the other content
 * pages - a 404 that arrives unstyled reads as a broken site rather than as a
 * wrong address.
 */
export function NotFoundPage({ locale }: { readonly locale: Locale }) {
  const t = useTranslations("error");

  return (
    <div
      data-region="reading"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-bold tracking-display text-balance">
          {t("notFoundTitle")}
        </h1>
        <p className="max-w-[60ch] text-lg text-muted-foreground">{t("notFoundBody")}</p>
      </div>

      <Button asChild className="self-start">
        <Link href={localizedPath("/", locale)}>{t("backHome")}</Link>
      </Button>
    </div>
  );
}
