import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/brand";
import { listFeatures } from "@/lib/content/features";
import { defaultLocale, locales } from "@/lib/i18n";
import { localizedPath, routes } from "@/lib/seo";

export const dynamic = "force-static";

/**
 * The sitemap is generated from the list of routes and the translations that
 * actually exist, rather than written by hand (M0.9.2). An untranslated page
 * does not make it in: half-translated pages must not appear in search results.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // The check pages are not listed by hand: the sitemap is built from the same
  // files the pages themselves are built from, or it falls behind.
  const paths = [
    ...routes.filter((route) => route.indexable).map((route) => route.path),
    ...listFeatures(defaultLocale).map((feature) => feature.path),
  ];

  return paths.map((path) => ({
    url: absoluteUrl(localizedPath(path, defaultLocale)),
    alternates: {
      languages: Object.fromEntries(
        locales.map((locale) => [locale, absoluteUrl(localizedPath(path, locale))]),
      ),
    },
  }));
}
