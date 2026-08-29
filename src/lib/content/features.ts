import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { defaultLocale, type Locale } from "@/lib/i18n";

import { parseFrontmatter } from "./frontmatter";

/**
 * A check is a file. Everything comes out of
 * `content/{locale}/features/{slug}.mdx`: the card on the workspace screen,
 * the card in the list of checks, the page at `/features/{slug}/` and the
 * sitemap entry.
 *
 * That also answers "how do I remove one": delete the file, and the cards and
 * links disappear with it - there is nowhere left to read them from. Links to
 * the deleted page from other texts are caught by the broken-link test, so
 * they cannot break silently.
 */
const CONTENT_ROOT = join(process.cwd(), "content");

/** Card icons. A closed list: the icon is part of the styling, not of the text. */
export const featureIcons = [
  "search",
  "code",
  "message",
  "shield",
  "type",
  "columns",
  "check",
] as const;

export type FeatureIcon = (typeof featureIcons)[number];

const featureFrontmatterSchema = z.object({
  /** The short name used on cards: "Scout". */
  name: z.string().min(1),
  /** The line on the card - a single sentence. */
  summary: z.string().min(1),
  /** The page title: "Scout - multi-source literature search". */
  title: z.string().min(1).optional(),
  /** The page subtitle, and the description used in search results. */
  description: z.string().min(1).optional(),
  /** Position in the lists. Without it the check goes to the end. */
  order: z.number().int().optional(),
  icon: z.enum(featureIcons).optional(),
});

export type Feature = {
  readonly id: string;
  readonly path: string;
  readonly name: string;
  readonly summary: string;
  readonly title?: string;
  readonly description?: string;
  readonly order: number;
  readonly icon: FeatureIcon;
};

export function featurePath(id: string): string {
  return `/features/${id}/`;
}

function featuresDir(locale: Locale): string {
  return join(CONTENT_ROOT, locale, "features");
}

export function listFeatures(locale: Locale = defaultLocale): readonly Feature[] {
  let files: string[];
  try {
    files = readdirSync(featuresDir(locale)).filter((file) => /\.mdx?$/.test(file));
  } catch {
    return [];
  }

  return files
    .map((file) => {
      const id = file.replace(/\.mdx?$/, "");
      const { data } = parseFrontmatter(
        readFileSync(join(featuresDir(locale), file), "utf8"),
        featureFrontmatterSchema,
        `${locale}/features/${file}`,
      );

      const feature: Feature = {
        id,
        path: featurePath(id),
        order: data.order ?? Number.MAX_SAFE_INTEGER,
        icon: data.icon ?? "check",
        name: data.name,
        summary: data.summary,
        ...(data.title === undefined ? {} : { title: data.title }),
        ...(data.description === undefined ? {} : { description: data.description }),
      };
      return feature;
    })
    .sort(
      (first, second) => first.order - second.order || first.id.localeCompare(second.id),
    );
}

export function findFeature(
  id: string,
  locale: Locale = defaultLocale,
): Feature | undefined {
  return listFeatures(locale).find((feature) => feature.id === id);
}
