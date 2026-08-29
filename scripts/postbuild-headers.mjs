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
 * into script-src (M0.7). The static export writes housekeeping scripts into
 * the HTML; we have exactly one of our own - applying the theme before the
 * first paint.
 *
 * Output: `out/_headers` for the host, and `out/security-headers.json`, the
 * reference the smoke test compares a deployed environment against.
 */
const OUT = "out";
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

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
    const body = match[1] ?? "";
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
