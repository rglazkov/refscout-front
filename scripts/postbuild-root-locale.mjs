import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Puts the default language at the root of `out/`.
 *
 * Every language is generated under its own prefix, so the build leaves
 * `out/en/privacy/` and no `out/privacy/`. This step copies the default
 * language's folder to the top, which is how the root comes to exist at all:
 * next-intl's way of serving a default language without a prefix is the
 * `as-needed` mode, and that rests on middleware, which a static export does
 * not have.
 *
 * The prefixed copy is left in place rather than deleted - it is what was
 * copied from, and removing it would make the two forms disagree the moment
 * anything cached one of them. Nothing advertises it: `canonical`, `hreflang`
 * and the sitemap all name the unprefixed form, because `localizedPath` gives
 * the default language no prefix.
 *
 * The two must stay byte-identical, which the header smoke test checks against
 * a deployed environment - a copy that silently stopped happening would
 * otherwise look like a working site right up until the root 404s.
 */
const OUT = "out";
const ROUTING = "src/lib/i18n/routing.ts";

/**
 * Read out of the source rather than repeated here: two places naming the
 * default language is two places to change, and the one that gets forgotten is
 * this one.
 */
const source = readFileSync(ROUTING, "utf8");
const found = /export const defaultLocale: Locale = "([a-z-]+)";/.exec(source);
if (found === null) {
  console.error(`Cannot read defaultLocale from ${ROUTING}.`);
  console.error("If its declaration moved, this step has to follow it.");
  process.exit(1);
}

const [, defaultLocale] = found;
const from = join(OUT, defaultLocale);

if (!existsSync(from)) {
  console.error(`The build produced no ${from}: the default language has no pages.`);
  process.exit(1);
}

cpSync(from, OUT, { recursive: true });
console.log(`Root: ${defaultLocale} copied to the top of ${OUT}/`);
