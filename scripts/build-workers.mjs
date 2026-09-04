import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

/**
 * The workers, built as files of our own.
 *
 * They are deliberately not left to the application bundler. Its way of
 * shipping `new Worker(new URL(…))` is a bootstrap script that receives the
 * list of chunks to load through its own address and pulls them in with
 * `importScripts`; that bootstrap does not start in Firefox, and it fails the
 * worst way a thing can fail - the worker exists, answers nothing, and raises
 * no error, so a person watches a card read "extracting" until it times out
 * over a document that was never opened.
 *
 * What comes out here is an ordinary module worker: one entry file per worker
 * plus the chunks its `import()` calls reach, addressed by a path that does not
 * change between builds. Every browser starts it the same way, the output can
 * be opened and read, and the price is this file.
 *
 * The split matters and is the reason for `splitting`. pdf.js and mammoth are a
 * megabyte between them, and they must arrive with the document that needs
 * them: somebody who brought a `.bib` downloads neither.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outdir = join(root, "public", "workers");

/**
 * The one alias both builds share besides `@`. A bibliography reader ships with
 * Node's HTTP clients for the addresses it can also read from, and they cannot
 * be bundled for a browser at all - nor should they be, since this is the box
 * documents are parsed in and it has no network. They are replaced by a
 * function that throws.
 */
const alias = {
  "@": join(root, "src"),
  "node-fetch": join(here, "stubs", "no-network.mjs"),
  "sync-fetch": join(here, "stubs", "no-network.mjs"),
};

/**
 * `global` is Node's name for the global object and does not exist in a
 * browser. The Word assembler's own browser bundle nonetheless reaches for it
 * by that name, once, to decide which kind of container to hand its file back
 * in - and an undefined name there is a `ReferenceError` at the last line of
 * the work, after the whole document has been packed.
 *
 * A substitution rather than a variable declared somewhere: nothing of ours
 * writes `global`, so the only occurrences this touches are a library's, and it
 * replaces them with the name every environment agrees on.
 */
const define = { global: "globalThis" };

rmSync(outdir, { recursive: true, force: true });

const result = await build({
  entryPoints: [
    join(root, "src", "workers", "parse.worker.ts"),
    join(root, "src", "workers", "gzip.worker.ts"),
    join(root, "src", "workers", "diff.worker.ts"),
  ],
  outdir,
  bundle: true,
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["chrome111", "firefox114", "safari16.4"],
  minify: true,
  sourcemap: true,
  alias,
  define,
  /*
   * Named by their entry rather than by a hash. The address is written in the
   * application by hand, so it has to be one a person can write; the chunks
   * behind it are hashed as usual, and the browser is told not to cache the
   * entry for long in `_headers`.
   */
  entryNames: "[name]",
  chunkNames: "chunks/[name]-[hash]",
  logLevel: "warning",
  metafile: true,
});

/**
 * The same workers again, as classic scripts with nothing to import.
 *
 * Module workers are the ordinary case and the one that keeps pdf.js away from
 * a person who brought a. But a browser that will not start one gives no useful
 * sign of it - the worker exists and answers nothing - and a product whose only
 * path to reading a document depends on that is a product that fails silently
 * for whoever is on the wrong browser or the wrong setting. So there is a
 * second copy that needs no module support at all: everything in one file, used
 * only when the first will not start.
 */
const fallback = await build({
  entryPoints: [
    join(root, "src", "workers", "parse.worker.ts"),
    join(root, "src", "workers", "gzip.worker.ts"),
    join(root, "src", "workers", "diff.worker.ts"),
  ],
  outdir: join(outdir, "classic"),
  bundle: true,
  format: "iife",
  platform: "browser",
  // The same floor as the module build. What this copy avoids is needing
  // module support inside a worker, not modern syntax.
  target: ["chrome111", "firefox114", "safari16.4"],
  minify: true,
  alias,
  define,
  entryNames: "[name]",
  logLevel: "warning",
  metafile: true,
});

const sizes = Object.entries({ ...result.metafile.outputs, ...fallback.metafile.outputs })
  .filter(([file]) => file.endsWith(".js"))
  .map(
    ([file, output]) =>
      `${file.replace(/\\/g, "/").split("public/")[1]} ${Math.round(output.bytes / 1024)} kB`,
  )
  .sort();

console.log(`Workers built into public/workers:\n  ${sizes.join("\n  ")}`);
