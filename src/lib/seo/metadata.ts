import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { absoluteUrl, site } from "@/lib/brand";
import { defaultLocale, locales, type Locale } from "@/lib/i18n";

import { routes, type RouteId } from "./routes";

/**
 * The pictures a browser tab and a shared link show. Both are drawn from the
 * brand config by `scripts/generate-brand-assets.mjs` at build time (§15).
 *
 * They are named here rather than left to Next's own icon convention, because
 * a metadata route in a static export comes out without a file extension, and
 * a host then serves the social image as an octet-stream to a crawler that
 * wanted a picture.
 */
const socialImage = { url: "/opengraph-image.png", width: 1200, height: 630 };

const icons = { icon: "/icon.png", apple: "/apple-icon.png" };

/**
 * The picture as each network wants it described (§15).
 *
 * Four of the five read Open Graph and nothing else - Facebook, Instagram and
 * WhatsApp through Facebook's crawler, Telegram through its own - and the
 * fifth, X, reads the `twitter:` tags and falls back to Open Graph only for
 * what it finds missing. So both sets are written out rather than one of them
 * being left to a fallback that a network is free to stop performing.
 *
 * `secureUrl` and `type` are there for the older crawlers among them, which
 * fetch a picture only once they have been told it is one and that it is on
 * https; a modern crawler reads the same fact off the `og:image` and the
 * response, and ignores both tags.
 */
function socialImages(alt: string) {
  const url = absoluteUrl(socialImage.url);
  return {
    openGraph: [{ ...socialImage, url, secureUrl: url, type: "image/png", alt }],
    twitter: [{ url, alt }],
  };
}

/**
 * Open Graph writes a language as `language_TERRITORY`; the router writes it as
 * the bare tag. Facebook - and with it Instagram and WhatsApp, which unfurl a
 * link through the same crawler - discards an `og:locale` in any other shape,
 * and a card that loses its language is served to the wrong audience.
 *
 * The map is exhaustive over the languages that exist, so a language added to
 * `locales` without its Open Graph form fails the type check rather than
 * shipping a discarded tag.
 */
const openGraphLocales: Record<Locale, string> = { en: "en_US" };

/** The account a card on X is attributed to, left out entirely while there is none. */
const attribution =
  site.social.x === "" ? {} : { site: site.social.x, creator: site.social.x };

/** The path of a page in a given language: the default language lives at the root. */
export function localizedPath(path: string, locale: Locale): string {
  return locale === defaultLocale ? path : `/${String(locale)}${path}`;
}

/**
 * The inverse: the address with its language prefix taken off, which is what
 * the language switcher needs to name this same page in another language (§15).
 * The default language carries no prefix, so an address that has none is
 * already the answer.
 *
 * The switcher itself is not built while there is one language. This is the
 * part of it that is worth having ready, because it is the only part with a
 * decision in it: switching has to keep the reader on the page they were on
 * rather than returning them to the start.
 */
export function unlocalizedPath(pathname: string): string {
  for (const locale of locales) {
    if (locale === defaultLocale) continue;
    const prefix = `/${String(locale)}`;
    if (pathname === prefix) return "/";
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname;
}

/**
 * The languages this same card exists in, which is what tells a crawler that
 * the other addresses under `hreflang` are translations rather than separate
 * pages. Empty while there is one language, and filled by adding a language.
 */
function alternateOpenGraphLocales(locale: Locale): string[] {
  return locales
    .filter((other) => other !== locale)
    .map((other) => openGraphLocales[other]);
}

/** The shared part: the canonical address and the translations of one path. */
function alternates(path: string, locale: Locale) {
  const languages: Record<string, string> = {};
  for (const other of locales) {
    languages[other] = absoluteUrl(localizedPath(path, other));
  }
  languages["x-default"] = absoluteUrl(localizedPath(path, defaultLocale));
  return { canonical: absoluteUrl(localizedPath(path, locale)), languages };
}

/**
 * Metadata for a check's page. The title and description come from the front
 * matter of its file, and failing that from the dictionary - the same strings
 * that appear on the cards.
 */
export async function buildFeatureMetadata(
  feature: {
    readonly id: string;
    readonly path: string;
    readonly name: string;
    readonly summary: string;
    readonly title?: string;
    readonly description?: string;
  },
  locale: Locale,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "meta" });
  const title = `${feature.title ?? feature.name} — ${site.name}`;
  const description = feature.description ?? feature.summary;
  const links = alternates(feature.path, locale);
  const images = socialImages(t("imageAlt", { brandName: site.name }));

  return {
    title,
    description,
    icons,
    alternates: links,
    openGraph: {
      type: "article",
      siteName: site.name,
      title,
      description,
      url: links.canonical,
      locale: openGraphLocales[locale],
      alternateLocale: alternateOpenGraphLocales(locale),
      images: images.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      ...attribution,
      title,
      description,
      images: images.twitter,
    },
  };
}

/**
 * Page metadata (M0.9.1). The texts come from the dictionary in the page's
 * language; hreflang comes from the translations that actually exist, plus
 * x-default.
 */
export async function buildMetadata(id: RouteId, locale: Locale): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "meta" });
  const route = routes.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`Unknown route: ${id}`);

  const title = t(`${id}.title`, { brandName: site.name });
  const description = t(`${id}.description`, { brandName: site.name });
  const links = alternates(route.path, locale);
  const images = socialImages(t("imageAlt", { brandName: site.name }));

  return {
    title,
    description,
    icons,
    alternates: links,
    robots: route.indexable ? undefined : { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: site.name,
      title,
      description,
      url: links.canonical,
      locale: openGraphLocales[locale],
      alternateLocale: alternateOpenGraphLocales(locale),
      images: images.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      ...attribution,
      title,
      description,
      images: images.twitter,
    },
  };
}
