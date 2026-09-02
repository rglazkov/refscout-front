const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const budget = require("./budget.json");
const basePath = (process.env.PAGES_BASE_PATH ?? "").replace(/\/$/, "");

/**
 * What a page costs on the first visit: the scripts its HTML actually asks for,
 * gzipped.
 *
 * Only two pages are recorded, and the pair is the point. `/` is the one that
 * matters - it is the landing page and the working screen at once, so it is
 * what a first visit pays. `/privacy/` is an ordinary static page, and the
 * difference between the two is exactly what the working screen adds on top of
 * the shell. When that difference starts growing, something that should be
 * arriving on demand is arriving up front.
 *
 * The third entry is everything else: every chunk the build produced that no
 * page asks for up front - pdf.js, mammoth, CodeMirror, the parsers. It is one
 * number rather than a cap per chunk on purpose, because the question it
 * answers is "how much has the on-demand half grown", and a per-chunk cap
 * answers that only for the chunk somebody thought to name.
 */
function scriptsFor(route) {
  const html = readFileSync(join("out", route, "index.html"), "utf8");
  const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  const preloads = [
    ...html.matchAll(/<link[^>]+rel="preload"[^>]+href="([^"]+\.js)"/g),
  ].map((m) => m[1]);
  const nextPrefix = `${basePath}/_next/`;
  return [...new Set([...sources, ...preloads])]
    .filter((src) => src.startsWith(nextPrefix))
    .map((src) => join("out", src.slice(basePath.length)));
}

/**
 * The chunks that arrive with an action rather than with the page: what is on
 * disk, minus what any page's HTML asked for. They do not compete with the
 * first paint, which is why they are weighed apart from it - and why the number
 * being separate is what makes a jump in it visible at all.
 */
function deferredChunks() {
  const upFront = new Set(pages().flatMap((route) => scriptsFor(route)));
  // Two places, because the workers are built by us into public/ rather than by
  // the application bundler: what a person downloads on demand is both.
  return [
    ...everyFile(join("out", "_next", "static", "chunks")),
    ...everyFile(join("out", "workers")),
  ].filter((path) => path.endsWith(".js") && !upFront.has(path));
}

function everyFile(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? everyFile(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

// No limits here on purpose: this file says what to measure, and budget.json
// says what is allowed. Keeping the two apart means the number a person edits
// is the recorded size, and the allowance stays a policy rather than a value
// buried in a config.
/** The recorded entries that are addresses; the other one is the group below. */
function pages() {
  return Object.keys(budget.routes).filter((name) => name.startsWith("/"));
}

module.exports = [
  ...pages().map((route) => ({
    name: route,
    path: scriptsFor(route),
    brotli: false,
    gzip: true,
  })),
  { name: "on demand", path: deferredChunks(), brotli: false, gzip: true },
];
