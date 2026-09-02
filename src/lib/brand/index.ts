import { brand } from "../../../brand.config";

/**
 * The site address comes from the environment. There are no absolute links to
 * the domain in the code: staging, preview and production each have their own,
 * and canonical links and the sitemap are built from it too.
 */
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const site = {
  ...brand,
  url: siteUrl.replace(/\/$/, ""),
} as const;

/** Absolute URL for canonical, hreflang, OG and the sitemap. */
export function absoluteUrl(path: string): string {
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}

export { Logo } from "./logo";
