import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type TokenSet = Readonly<Record<string, string>>;

const TOKENS_FILE = resolve(process.cwd(), "src/app/tokens.css");

function parseBlock(css: string, header: string): TokenSet {
  const start = css.indexOf(header);
  if (start === -1) throw new Error(`Token block not found: ${header}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = css.slice(open + 1, end);
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    // A value long enough to be wrapped carries the indentation of the block
    // it sits in, and the two dark copies are nested to different depths, so
    // the run of whitespace is collapsed before the copies are compared.
    if (name !== undefined && value !== undefined) {
      tokens[name] = value.trim().replace(/\s+/g, " ");
    }
  }
  return tokens;
}

const css = readFileSync(TOKENS_FILE, "utf8");

/** The light theme. */
export const lightTokens = parseBlock(css, ":root {");

/** The dark theme selected by the system preference. */
export const systemDarkTokens = parseBlock(css, ':root:not([data-theme="light"])');

/** The dark theme selected explicitly. */
export const explicitDarkTokens = parseBlock(css, ':root[data-theme="dark"]');

export const themes: ReadonlyArray<readonly [string, TokenSet]> = [
  ["light", lightTokens],
  ["dark", explicitDarkTokens],
];
