import { useTranslations } from "next-intl";

/**
 * A route placeholder. The page explains that it does not exist yet instead of
 * pretending to be empty: an unfinished thing is either absent or speaks for
 * itself (§13).
 */
export function StubPage({ titleKey }: { readonly titleKey: string }) {
  const nav = useTranslations("nav");
  const t = useTranslations("stub");

  return (
    // A page somebody came to read, so it takes the same column, the same
    // reading face and the same heading step as the other content pages: the
    // top of the ladder is where a content page's title sits (§15).
    <div
      data-region="reading"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"
    >
      <h1 className="text-3xl leading-tight font-bold tracking-display text-balance">
        {nav(titleKey)}
      </h1>
      <p className="text-lg text-muted-foreground">{t("body")}</p>
    </div>
  );
}
