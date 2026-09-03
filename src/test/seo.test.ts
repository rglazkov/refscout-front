import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { listFeatures } from "@/lib/content/features";
import { defaultLocale, locales } from "@/lib/i18n";
import { serializeJsonLd } from "@/lib/seo/json-ld";
import { routes } from "@/lib/seo";

/**
 * What a crawler is served. Two things are checked here and neither shows up in
 * a browser: the map of the site, which is assembled rather than written, and
 * the structured data, which is a script element built out of our own text.
 */
describe("structured data", () => {
  it("cannot close its own script element", () => {
    // The whole reason the serialisation is a function of its own. A `<` that
    // reached the page as itself would end the block early and everything after
    // it would be read as markup - an injection through one's own content.
    const serialized = serializeJsonLd({
      name: "</script><script>alert(1)</script>",
      featureList: ["a <b> c"],
    });

    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c");
    // Escaped, not lost: what a reader of the data gets back is the text itself.
    expect(JSON.parse(serialized)).toEqual({
      name: "</script><script>alert(1)</script>",
      featureList: ["a <b> c"],
    });
  });
});

describe("the map of the site", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  it("holds every page that is meant to be found", () => {
    const expected = [
      ...routes.filter((route) => route.indexable).map((route) => route.path),
      ...listFeatures(defaultLocale).map((feature) => feature.path),
    ];

    for (const path of expected) {
      expect(urls.some((url) => url.endsWith(path))).toBe(true);
    }
    expect(urls).toHaveLength(expected.length);
    // The page the offer ends on is one of them, and it is the newest: a route
    // added without reaching the map is a page nothing links to from outside.
    expect(urls.some((url) => url.endsWith("/pricing/"))).toBe(true);
  });

  it("holds nothing that is kept out of search results", () => {
    for (const route of routes.filter((candidate) => !candidate.indexable)) {
      expect(urls.some((url) => url.endsWith(route.path))).toBe(false);
    }
  });

  it("names every language of every page and no other address", () => {
    for (const entry of entries) {
      expect(Object.keys(entry.alternates?.languages ?? {}).sort()).toEqual(
        [...locales].sort(),
      );
    }
  });
});
