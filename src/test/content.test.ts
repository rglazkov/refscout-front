import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import { listFeatures } from "@/lib/content/features";
import {
  contentFilePath,
  contentNameFor,
  loadPageBody,
  readPageFrontmatter,
} from "@/lib/content/pages";
import { defaultLocale, locales } from "@/lib/i18n";
import { routes } from "@/lib/seo";

/** Every page file of a locale: paths relative to content/{locale}/ without the extension. */
function pageFiles(locale: string): string[] {
  const root = join(process.cwd(), "content", locale);
  const found: string[] = [];

  function walk(dir: string, prefix: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, `${prefix}${entry}/`);
      } else if (/\.mdx?$/.test(entry)) {
        found.push(`${prefix}${entry.replace(/\.mdx?$/, "")}`);
      }
    }
  }

  walk(root, "");
  return found;
}

describe("pages", () => {
  it("every file corresponds to a page that exists", () => {
    // A file no address answers to is text that was written and then lost: it
    // sits in the repository unpublished, with nothing to make that visible.
    const known = new Set([
      ...routes.map((route) => contentNameFor(route.path)),
      ...listFeatures(defaultLocale).map((feature) => contentNameFor(feature.path)),
    ]);

    for (const locale of locales) {
      const orphans = pageFiles(locale).filter((name) => !known.has(name));
      expect(orphans).toEqual([]);
    }
  });

  it("a page without a file has no body and says the text is being prepared", async () => {
    await expect(loadPageBody("features/no-such-check")).resolves.toBeNull();
  });

  it("the page front matter has the right shape", () => {
    for (const locale of locales) {
      for (const name of pageFiles(locale)) {
        expect(() => readPageFrontmatter(name, locale)).not.toThrow();
      }
    }
  });
});

describe("checks", () => {
  it("the front matter of every file has the right shape", () => {
    for (const locale of locales) {
      expect(() => listFeatures(locale)).not.toThrow();
    }
  });

  it("each one has a name and a line for its card", () => {
    // The card is drawn from the file rather than from the dictionary: without
    // these two fields it would be an empty frame linking nowhere.
    for (const feature of listFeatures(defaultLocale)) {
      expect(feature.name.length).toBeGreaterThan(0);
      expect(feature.summary.length).toBeGreaterThan(0);
    }
  });

  it("the addresses are unique and the order is set", () => {
    const features = listFeatures(defaultLocale);
    const ids = features.map((feature) => feature.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(features.map((feature) => feature.order)).toEqual(
      [...features.map((feature) => feature.order)].sort((a, b) => a - b),
    );
  });
});

/** The internal links of a text, both markdown-style and via href. */
function internalLinks(source: string): string[] {
  const markdown = [...source.matchAll(/\]\((\/[^)\s]*)\)/g)].map(
    (match) => match[1] ?? "",
  );
  const href = [...source.matchAll(/href="(\/[^"]*)"/g)].map((match) => match[1] ?? "");
  return [...markdown, ...href].map((link) => link.split("#")[0] ?? "").filter(Boolean);
}

describe("links inside the texts", () => {
  it("point at pages that exist", () => {
    // This answers "how do I remove one": the file is deleted in a single move,
    // and everything that linked to it stops being a silent error and turns red.
    const known = new Set<string>([
      ...routes.map((route) => route.path),
      ...listFeatures(defaultLocale).map((feature) => feature.path),
    ]);

    const broken: string[] = [];
    for (const locale of locales) {
      const files = pageFiles(locale).map((name) => ({
        where: `${locale}/${name}.mdx`,
        file: contentFilePath(name, locale),
      }));

      for (const { where, file } of files) {
        for (const link of internalLinks(readFileSync(file, "utf8"))) {
          if (!known.has(link)) broken.push(`${where} -> ${link}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
