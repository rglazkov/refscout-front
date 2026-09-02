import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Post-build: the workers' source maps are built but not published.
 *
 * They are worth having - a minified worker is unreadable, and the parsers are
 * the part of the product most worth stepping through - so `npm run build`
 * still writes them, and they stay in `public/workers`, where `next dev` serves
 * them and the browser resolves them as usual. What they have no business
 * doing is riding out with the export: `sourcesContent` carries a copy of every
 * source the workers import, they run to megabytes, and nothing loads them
 * unless somebody opens the developer tools. Nothing in the product reads a
 * source map at run time, so removing them here cannot change how it behaves.
 *
 * The comment at the foot of each script goes with them. Left behind it names a
 * file that is no longer there, and the one person it is meant to help - the
 * one with the tools open - is the one person who would see the 404.
 *
 * To read a deployed build, build the same commit again: the maps land in
 * `public/workers` on the way through.
 */
const WORKERS = path.join("out", "workers");
const TRAILING_COMMENT = /\n?\/\/# sourceMappingURL=.*\n?$/;

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesIn(full)));
    else found.push(full);
  }
  return found;
}

let removed = 0;
let unlinked = 0;

for (const file of await filesIn(WORKERS)) {
  if (file.endsWith(".map")) {
    await rm(file);
    removed += 1;
    continue;
  }
  if (!file.endsWith(".js")) continue;
  const source = await readFile(file, "utf8");
  const stripped = source.replace(TRAILING_COMMENT, "\n");
  if (stripped === source) continue;
  await writeFile(file, stripped, "utf8");
  unlinked += 1;
}

console.log(
  `Worker source maps kept out of the export: ${removed} removed, ${unlinked} script(s) unlinked.`,
);
