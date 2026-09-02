import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The fonts are ours and they sit in `public/fonts`, so a name in the code that
 * matches no file there is not an error anybody sees: the request 404s quietly,
 * the browser carries on with the fallback face, and the only symptom is the
 * flash of the wrong serif that the preload was added to remove.
 *
 * The names are read out of the source rather than duplicated here, because a
 * copy of a list is a copy that goes stale.
 */
const files = new Set(readdirSync("public/fonts"));

function preloadedNames(): string[] {
  const source = readFileSync("src/components/shell/site-document.tsx", "utf8");
  const block = /const PRELOADED_FONTS = \[([\s\S]*?)\];/.exec(source)?.[1] ?? "";
  return [...block.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("the fonts named in the code are the fonts in the folder", () => {
  it("found the list at all", () => {
    // Without this a regex that stopped matching would leave every assertion
    // below passing over an empty list.
    expect(preloadedNames().length).toBeGreaterThan(2);
  });

  it("every preloaded slice exists", () => {
    const missing = preloadedNames().filter((name) => !files.has(`${name}.woff2`));
    expect(missing).toEqual([]);
  });

  it("every face the stylesheet asks for exists", () => {
    const css = readFileSync("src/app/fonts.css", "utf8");
    const wanted = [...css.matchAll(/url\("\/fonts\/([^"]+)"\)/g)].map(
      (match) => match[1] ?? "",
    );
    expect(wanted.length).toBeGreaterThan(10);
    expect(wanted.filter((name) => !files.has(name))).toEqual([]);
  });
});
