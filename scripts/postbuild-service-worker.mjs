import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { injectManifest } from "@serwist/build";

/**
 * Post-build: the shell's cache manifest, collected from the folder that was
 * actually built.
 *
 * It runs beside the step that collects the hashes of the inline scripts for
 * the security policy, and for the same reason: both are questions about the
 * finished output, and answering them from a list written by hand means the
 * list is wrong the first time somebody adds a file.
 *
 * The library is taken rather than written. Cache invalidation and navigation
 * requests are the class of problem where a home-made version does not break in
 * development - it breaks at a person's machine, months later, with an old
 * version wedged in a cache they cannot reach.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = join(root, "out");
const source = join(root, "src", "sw", "service-worker.ts");
const destination = join(out, "sw.js");

/** What is worth having before the network goes: the shell, and only the shell. */
const PRECACHE = [
  "**/*.html",
  "_next/static/**/*.{js,css}",
  "fonts/**/*.woff2",
  "icon.png",
  "apple-icon.png",
];

/**
 * What is deliberately left out, and why each one is out.
 *
 * The parsers and pdf.js data weigh more than everything else together, and a
 * first visit must not pay for them; they are cached as they are used. The mock
 * service worker belongs to the tests. And the source maps are for us.
 */
const NOT_PRECACHED = [
  "workers/**",
  "pdfjs/**",
  "mockServiceWorker.js",
  "**/*.map",
  "**/*.txt",
];

/**
 * What the shell is allowed to weigh, in kilobytes. It is a recorded figure
 * like the page budgets beside it: going over says so here, at the build, with
 * the number it went over by.
 */
const BUDGET_KB = 6144;

/**
 * A page is cached under the address people visit rather than under the file it
 * is written to.
 *
 * The difference is not cosmetic. The response that goes into the cache is
 * stored with the headers it was served with, and the security policy of a page
 * carries the hashes of that page's own inline scripts. Asked for as
 * `privacy/index.html`, the file comes back under whatever policy that path
 * happens to match - and then the page opened offline is served a policy
 * belonging to some other page, its own inline scripts are refused, and what
 * the person gets is a blank screen at exactly the moment the network is gone.
 *
 * The addresses stay relative, which is what makes the shell work under a
 * project sub-path: the worker is served from that folder, so every entry
 * resolves inside it without anything being rewritten.
 */
function asDirectoryUrls(manifest) {
  return {
    manifest: manifest.map((entry) =>
      entry.url.endsWith("index.html")
        ? {
            ...entry,
            url:
              entry.url === "index.html"
                ? "./"
                : entry.url.slice(0, -"index.html".length),
          }
        : entry,
    ),
    warnings: [],
  };
}

const staging = mkdtempSync(join(tmpdir(), "refscout-sw-"));
const bundled = join(staging, "service-worker.js");

try {
  /*
   * Bundled first, injected second: the injection is a text substitution into a
   * finished file and does not compile anything itself. Nothing is minified,
   * because the placeholder the injection looks for is an ordinary property
   * access and a mangler is entitled to rewrite one.
   */
  await build({
    entryPoints: [source],
    bundle: true,
    format: "esm",
    target: "es2022",
    platform: "browser",
    minify: false,
    outfile: bundled,
    alias: { "@": join(root, "src") },
  });

  const { count, size, warnings } = await injectManifest({
    swSrc: bundled,
    swDest: destination,
    globDirectory: out,
    globPatterns: PRECACHE,
    globIgnores: NOT_PRECACHED,
    // A file whose name carries the hash of its content is already addressed by
    // its content, and a query string appended to it would only make a second
    // entry in the cache for the same bytes.
    dontCacheBustURLsMatching: /-[0-9a-z_-]{8,}\.(?:js|css|woff2)$/i,
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
    manifestTransforms: [asDirectoryUrls],
  });

  for (const warning of warnings) console.warn(`  ${warning}`);

  /*
   * What must not be in the shell, checked in the file that was written rather
   * than trusted to the patterns above. The parsers and pdf.js data weigh more
   * than everything else together and are cached as they are used; a glob quietly
   * widened one day would otherwise put a first visit's traffic up fourfold, and
   * the size alone would not say which of them had come along.
   */
  const written = readFileSync(destination, "utf8");
  const smuggled = ["/workers/", "/pdfjs/", "mockServiceWorker"].filter(
    (path) => written.includes(`"url":"${path}`) || written.includes(`url: "${path}`),
  );
  if (smuggled.length > 0) {
    console.error("");
    console.error(`The offline shell picked up ${smuggled.join(", ")}.`);
    console.error("Those are cached as they are used, not before a first visit.");
    process.exit(1);
  }

  const kb = size / 1024;
  console.log("Offline shell");
  console.log(
    `  ${String(count).padStart(4)} files  ${kb.toFixed(1).padStart(8)} kB precached ` +
      `(allowed ${BUDGET_KB})`,
  );
  console.log(`  ${(statSync(destination).size / 1024).toFixed(1)} kB service worker`);

  if (kb > BUDGET_KB) {
    console.error("");
    console.error(
      `The offline shell is ${(kb - BUDGET_KB).toFixed(1)} kB past what it is allowed.`,
    );
    console.error(
      "Either something large joined the shell, or a parser stopped being excluded.",
    );
    process.exit(1);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}
