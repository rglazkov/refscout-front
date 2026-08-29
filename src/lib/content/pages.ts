import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ComponentType } from "react";
import { z } from "zod";

import { defaultLocale, type Locale } from "@/lib/i18n";

import { parseFrontmatter } from "./frontmatter";

/**
 * Where the text of a page lives.
 *
 * There is one rule and it follows from the URL: the page path without slashes
 * is the file name. `/privacy/` -> `content/{locale}/privacy.mdx`,
 * `/features/scout/` -> `content/{locale}/features/scout.mdx`. There is no
 * mapping to invent or remember: the page address is visible in the browser,
 * and the file is named the same.
 *
 * A page is also a navigation entry, metadata and a decision about search
 * indexing, so a file alone is not enough to bring one into existence: a file
 * dropped into content/ by accident must not become a public address of the
 * site.
 */
const CONTENT_ROOT = join(process.cwd(), "content");

/** The file name for a page address: `/features/scout/` -> `features/scout`. */
export function contentNameFor(path: string): string {
  const trimmed = path.replace(/^\/|\/$/g, "");
  return trimmed === "" ? "index" : trimmed;
}

export function contentFilePath(name: string, locale: Locale = defaultLocale): string {
  return join(CONTENT_ROOT, locale, `${name}.mdx`);
}

/**
 * The text of the page has not been written yet - a normal state, not an
 * error: the page says that it is being prepared instead of pretending to be
 * empty (§13).
 */
export function hasPageContent(name: string, locale: Locale = defaultLocale): boolean {
  return existsSync(contentFilePath(name, locale));
}

const pageFrontmatterSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export type PageFrontmatter = z.infer<typeof pageFrontmatterSchema>;

/**
 * The front matter of a page. Both fields are optional: without them the title
 * and subtitle come from the dictionary. When present they override both what
 * is on screen and the metadata, so that a page describes itself in a single
 * file.
 */
export function readPageFrontmatter(
  name: string,
  locale: Locale = defaultLocale,
): PageFrontmatter {
  if (!hasPageContent(name, locale)) return {};

  const { data } = parseFrontmatter(
    readFileSync(contentFilePath(name, locale), "utf8"),
    pageFrontmatterSchema,
    `${locale}/${name}.mdx`,
  );
  return data;
}

/**
 * The body of a page. The only place that knows the path from the code to
 * content/ - otherwise every new screen would invent its own relative path and
 * its own mistake in it. Returns null when there is no text yet: the caller
 * then says that the page is being prepared.
 */
export async function loadPageBody(
  name: string,
  locale: Locale = defaultLocale,
): Promise<ComponentType | null> {
  if (!hasPageContent(name, locale)) return null;

  // A file with front matter only is a page that has been created but not yet
  // written: it should say so honestly rather than show emptiness under a heading.
  const { content } = parseFrontmatter(
    readFileSync(contentFilePath(name, locale), "utf8"),
    pageFrontmatterSchema.passthrough(),
    `${locale}/${name}.mdx`,
  );
  if (content.trim() === "") return null;

  const mdx = (await import(`../../../content/${locale}/${name}.mdx`)) as {
    default: ComponentType;
  };
  return mdx.default;
}
