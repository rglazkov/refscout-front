import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { brand } from "../../brand.config";

/**
 * Three ten-line tests that remove three classes of future rework (M0.4.4).
 * Each is cheap exactly now: switched on over finished code, it produces a list
 * of exceptions, and a list of exceptions never gets shorter.
 */
const SRC = resolve(process.cwd(), "src");
const TOKENS = join(SRC, "app", "tokens.css").split(sep).join("/");

function files(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, acc);
    else if (/\.(ts|tsx|css|json)$/.test(entry)) acc.push(full.split(sep).join("/"));
  }
  return acc;
}

// The tests themselves mention the forbidden strings - otherwise they would
// have nothing to search for.
const sources = files(SRC)
  .filter((path) => !path.includes("/test/"))
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("grep rules over the source", () => {
  it("the product name does not appear in src/", () => {
    // Rebranding has to be an edit to brand.config.ts, not to a hundred files.
    const offenders = sources
      .filter((file) => file.text.includes(brand.name))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("dangerouslySetInnerHTML appears nowhere", () => {
    // Markdown from someone else's document must not become an XSS vector.
    const offenders = sources
      .filter((file) => file.text.includes("dangerouslySetInnerHTML"))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("colours appear nowhere outside the tokens file", () => {
    // The dark theme drifts away from the light one one hard-coded colour at a time.
    const color = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
    const offenders = sources
      .filter((file) => file.path !== TOKENS && color.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
