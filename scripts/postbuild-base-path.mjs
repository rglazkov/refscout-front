import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const basePath = (process.env.PAGES_BASE_PATH ?? "").replace(/\/$/, "");

if (basePath === "") {
  process.exit(0);
}

if (!basePath.startsWith("/")) {
  throw new Error("PAGES_BASE_PATH must be empty or start with a slash.");
}

async function cssFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await cssFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith(".css")) files.push(entryPath);
  }

  return files;
}

let changed = 0;
for (const file of await cssFiles(path.join("out", "_next", "static"))) {
  const source = await readFile(file, "utf8");
  const prefixed = source.replaceAll("url(/fonts/", `url(${basePath}/fonts/`);
  if (prefixed === source) continue;
  await writeFile(file, prefixed, "utf8");
  changed += 1;
}

console.log(`GitHub Pages base path applied to ${changed} CSS file(s).`);
