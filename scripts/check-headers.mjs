import { readFileSync } from "node:fs";

/**
 * A smoke test of the headers against a deployed environment. A strict policy
 * that exists only in the repository protects nobody: the host may fail to
 * apply it, and we want to hear about that from CI rather than from a security
 * researcher.
 *
 *  node scripts/check-headers.mjs https://stand.example
 */
const base = process.argv[2];
if (base === undefined) {
  console.error(
    "Pass the environment address: node scripts/check-headers.mjs https://stand",
  );
  process.exit(2);
}

const expected = JSON.parse(readFileSync("out/security-headers.json", "utf8"));
const problems = [];

/** Matches src/lib/i18n/routing.ts; the root is a copy of this language. */
const DEFAULT_LOCALE = "en";

for (const { route, headers } of expected) {
  const url = new URL(route, base).toString();
  const response = await fetch(url, { redirect: "manual" });

  for (const [name, value] of Object.entries(headers)) {
    const actual = response.headers.get(name);
    if (actual === null) {
      problems.push(`${route}: header ${name} is missing`);
      continue;
    }
    // The CSP is compared as a set of directives rather than byte for byte:
    // their order does not matter.
    if (name === "Content-Security-Policy") {
      const want = new Set(value.split(";").map((part) => part.trim()));
      const got = new Set(actual.split(";").map((part) => part.trim()));
      for (const directive of want) {
        if (!got.has(directive)) problems.push(`${route}: CSP is missing "${directive}"`);
      }
      continue;
    }
    if (actual.trim() !== value.trim()) {
      problems.push(`${route}: ${name} = "${actual}", expected "${value}"`);
    }
  }
}

/**
 * The unprefixed root is made by a post-build copy rather than by the router,
 * so it is the one part of the site that no amount of building can prove
 * correct: a copy that stopped happening leaves a site that looks fine
 * everywhere except at the address most people arrive on.
 */
const rootPages = expected
  .map(({ route }) => route)
  .filter((route) => !route.startsWith(`/${DEFAULT_LOCALE}/`) && !route.startsWith("/_"));

for (const route of rootPages) {
  const prefixed = route === "/" ? `/${DEFAULT_LOCALE}/` : `/${DEFAULT_LOCALE}${route}`;
  const [atRoot, underPrefix] = await Promise.all([
    fetch(new URL(route, base).toString()),
    fetch(new URL(prefixed, base).toString()),
  ]);

  if (!atRoot.ok) {
    problems.push(`${route}: answered ${atRoot.status}, and it is the canonical form`);
    continue;
  }
  if (!underPrefix.ok) continue;

  const [rootHtml, prefixedHtml] = await Promise.all([atRoot.text(), underPrefix.text()]);
  if (rootHtml !== prefixedHtml) {
    problems.push(`${route}: differs from ${prefixed}, so the root copy is stale`);
  }
}

if (problems.length > 0) {
  console.error(`Mismatches: ${problems.length}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`Deployed headers match the reference on ${expected.length} pages.`);
