/**
 * The list of languages, and the only place it exists. The static folders are
 * expanded from it at build time, and so are hreflang and the sitemap.
 *
 * The default language is served from the root `/`, the rest from a `/{locale}`
 * prefix. There is no automatic Accept-Language redirect and there will not be
 * one: it breaks direct links and search results, and a static export has
 * nowhere to perform it.
 */
export const locales = ["en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * Every language is generated under its own prefix, the default one included.
 * The unprefixed root is made afterwards, by
 * `scripts/postbuild-root-locale.mjs` copying the default language's folder to
 * the top of `out/`.
 *
 * That is the only way to serve the default language from `/` in a static
 * export: next-intl's `as-needed` prefix mode rests on middleware, and a static
 * export has none. The canonical form stays the unprefixed one - canonical,
 * hreflang and the sitemap all point there - so the prefixed copy of the
 * default language is not an address anything advertises.
 */
export function localeParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}
