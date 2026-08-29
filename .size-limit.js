const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const budget = require("./budget.json");

/**
 * What a page costs on the first visit: the scripts its HTML actually asks for,
 * gzipped (M0.9.3).
 *
 * Only two pages are recorded, and the pair is the point. `/` is the one that
 * matters - it is the landing page and the working screen at once, so it is
 * what a first visit pays. `/privacy/` is an ordinary static page, and the
 * difference between the two is exactly what the working screen adds on top of
 * the shell. When that difference starts growing, something that should be
 * arriving on demand is arriving up front.
 *
 * Nothing here sees the chunks that load later - pdf.js, CodeMirror, the .docx
 * builder. That is deliberate: they do not compete with the first paint, and
 * they get their own entries in M2, measured against the action that pulls
 * them. What keeps them out of this number is the architecture test, not a
 * budget.
 */
function scriptsFor(route) {
  const html = readFileSync(join("out", route, "index.html"), "utf8");
  const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const preloads = [
    ...html.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+\.js)"/g),
  ].map((m) => m[1]);
  return [...new Set([...sources, ...preloads])]
    .filter((src) => src.startsWith("/_next/"))
    .map((src) => join("out", src));
}

// No limits here on purpose: this file says what to measure, and budget.json
// says what is allowed. Keeping the two apart means the number a person edits
// is the recorded size, and the allowance stays a policy rather than a value
// buried in a config.
module.exports = Object.keys(budget.routes).map((route) => ({
  name: route,
  path: scriptsFor(route),
  brotli: false,
  gzip: true,
}));
