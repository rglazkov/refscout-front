/**
 * The list of routes is the source both for the sitemap and for the check that
 * every page has metadata. A new page that never made it here turns CI red.
 */
export type RouteId = "home" | "features" | "pricing" | "account" | "privacy";

export type RouteDefinition = {
  readonly id: RouteId;
  /** The path without a language prefix, always with a trailing slash. */
  readonly path: string;
  /** Pages that must appear neither in the sitemap nor in search results. */
  readonly indexable: boolean;
};

export const routes: readonly RouteDefinition[] = [
  { id: "home", path: "/", indexable: true },
  { id: "features", path: "/features/", indexable: true },
  { id: "pricing", path: "/pricing/", indexable: true },
  { id: "account", path: "/account/", indexable: false },
  { id: "privacy", path: "/privacy/", indexable: true },
];
