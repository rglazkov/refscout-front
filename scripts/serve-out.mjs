import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

/**
 * Serves the built static output with the same headers production applies
 * (out/security-headers.json, produced by the post-build step). It exists
 * because a CSP violation test only means anything against the real policy.
 */
const OUT = "out";
const PORT = Number(process.env.PORT ?? 4173);

/**
 * The reference is re-read on every request instead of being cached at start-up:
 * inline script hashes change with every build, and this server outlives a
 * rebuild (playwright reuses an already running one). Cached hashes would mean
 * every page suddenly violating the CSP for a reason that cannot be found
 * anywhere in the code.
 */
function headersByRoute() {
  const routes = JSON.parse(readFileSync(join(OUT, "security-headers.json"), "utf8"));
  return new Map(routes.map((entry) => [entry.route, entry.headers]));
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${PORT}`);
  const route = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;

  const safe = url.pathname
    .split("/")
    .filter((part) => part !== "" && part !== "." && part !== "..")
    .join("/");
  let file = join(OUT, safe);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;

  const known = headersByRoute();
  const headers = known.get(route) ?? known.get("/") ?? {};
  for (const [name, value] of Object.entries(headers)) {
    // HSTS over http is meaningless and gets in the way of a local run.
    if (name === "Strict-Transport-Security") continue;
    response.setHeader(name, value);
  }

  if (!existsSync(file)) {
    response.statusCode = 404;
    response.setHeader("Content-Type", TYPES[".html"]);
    createReadStream(join(OUT, "404.html")).pipe(response);
    return;
  }

  response.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(response);
}).listen(PORT, () => {
  console.log(`Static output on http://localhost:${PORT}`);
});
