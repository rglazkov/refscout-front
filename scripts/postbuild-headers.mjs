import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, posix, sep } from "node:path";

import {
  commonHeaders,
  contentSecurityPolicy,
  PAYMENT_ROUTES,
} from "../config/security-headers.mjs";

/**
 * Post-build: collects the hashes of every page's inline scripts and puts them
 * into script-src. The static export writes housekeeping scripts into the HTML;
 * we have exactly one of our own - applying the theme before the first paint.
 *
 * Output: `out/_headers` for the host, and `out/security-headers.json`, the
 * reference the smoke test compares a deployed environment against.
 */
const OUT = "out";
const INLINE_SCRIPT = /<script((?![^>]*\bsrc=)[^>]*)>([\s\S]*?)<\/script>/g;

/**
 * A script element whose type is not a JavaScript one is a block of data: the
 * browser reads it and executes nothing, and the policy on script sources has
 * no opinion about it. The structured data on the marketing pages is exactly
 * that, and hashing it would put the sha256 of a JSON document into script-src
 * - a value that changes with every edit to the page's own text and permits
 * nothing.
 */
const SCRIPT_TYPE = /\btype\s*=\s*["']([^"']+)["']/i;
const JAVASCRIPT_TYPES = new Set([
  "text/javascript",
  "application/javascript",
  "module",
  "importmap",
  "speculationrules",
]);

function htmlFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) htmlFiles(full, acc);
    else if (entry.endsWith(".html")) acc.push(full);
  }
  return acc;
}

function routeOf(file) {
  const relative = file
    .slice(OUT.length + 1)
    .split(sep)
    .join(posix.sep);
  if (relative === "index.html") return "/";
  if (relative.endsWith("/index.html"))
    return `/${relative.slice(0, -"index.html".length)}`;
  return `/${relative}`;
}

function hashesOf(html) {
  const hashes = new Set();
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const type = SCRIPT_TYPE.exec(match[1] ?? "")?.[1]?.toLowerCase();
    if (type !== undefined && !JAVASCRIPT_TYPES.has(type)) continue;
    const body = match[2] ?? "";
    if (body.trim() === "") continue;
    hashes.add(`sha256-${createHash("sha256").update(body, "utf8").digest("base64")}`);
  }
  return [...hashes];
}

const routes = htmlFiles(OUT)
  .map((file) => {
    const route = routeOf(file);
    const payments = PAYMENT_ROUTES.includes(route);
    return {
      route,
      headers: {
        ...commonHeaders,
        "Content-Security-Policy": contentSecurityPolicy(
          hashesOf(readFileSync(file, "utf8")),
          { payments },
        ),
      },
    };
  })
  .sort((a, b) => a.route.localeCompare(b.route));

const lines = [];
for (const { route, headers } of routes) {
  lines.push(route === "/" ? "/" : route.replace(/\/$/, ""));
  for (const [name, value] of Object.entries(headers)) lines.push(`  ${name}: ${value}`);
  lines.push("");
}
writeFileSync(join(OUT, "_headers"), lines.join("\n"), "utf8");
writeFileSync(
  join(OUT, "security-headers.json"),
  JSON.stringify(routes, null, 2),
  "utf8",
);

console.log(`Headers generated for ${routes.length} pages: out/_headers`);
