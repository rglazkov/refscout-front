import { getTranslations } from "next-intl/server";

import { contentNameFor, loadPageBody, readPageFrontmatter } from "@/lib/content/pages";
import { type Locale } from "@/lib/i18n";

type PageContentProps = {
  /** The page address; the name of the text file is derived from it. */
  readonly route: string;
  /** The dictionary key for the title, for when the front matter does not set one. */
  readonly titleKey: string;
  readonly locale: Locale;
};

/**
 * A long page: the title, subtitle and text come from
 * content/{locale}/{path}.mdx. While the file is missing, the page says
 * honestly that the text is being prepared, instead of showing an empty screen
 * that looks like a breakage.
 */
export async function PageContent({ route, titleKey, locale }: PageContentProps) {
  const name = contentNameFor(route);
  const nav = await getTranslations("nav");
  const t = await getTranslations("page");
  const front = readPageFrontmatter(name, locale);
  const Body = await loadPageBody(name, locale);

  return (
    <div
      data-region="reading"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-bold tracking-display text-balance">
          {front.title ?? nav(titleKey)}
        </h1>
        {front.description === undefined ? null : (
          <p className="max-w-[60ch] text-lg text-muted-foreground">
            {front.description}
          </p>
        )}
      </div>

      {Body === null ? (
        <p className="text-muted-foreground">{t("pending")}</p>
      ) : (
        // No typography here: how a paragraph reads is decided once, in
        // src/mdx-components.tsx, and a selector in this file would silently
        // outrank it.
        <div>
          <Body />
        </div>
      )}
    </div>
  );
}
