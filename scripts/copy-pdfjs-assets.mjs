import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * pdf.js needs four folders of resources beside it, and they are copied at
 * build time from the installed package.
 *
 * This is not a nicety. Without `cmaps/`, a PDF written in Chinese, Japanese or
 * Korean extracts as an empty string - which the quality heuristics then read
 * as "this document is a scan", so a perfectly good file is turned away with a
 * refusal the person cannot act on. It is checked by a fixture in the corpus
 * rather than by anyone looking.
 *
 * Nothing is downloaded here: the files come from `node_modules`, exactly as
 * the fonts come from the repository. A build that reaches the network is a
 * build that stops working when somebody else's host does.
 */
const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "node_modules", "pdfjs-dist");
const into = join(here, "..", "public", "pdfjs");

/** The four the parser is given paths to, and nothing else from the package. */
const FOLDERS = ["cmaps", "standard_fonts", "wasm", "iccs"];

rmSync(into, { recursive: true, force: true });
mkdirSync(into, { recursive: true });

for (const folder of FOLDERS) {
  cpSync(join(from, folder), join(into, folder), { recursive: true });
}

console.log(`pdf.js resources copied into public/pdfjs: ${FOLDERS.join(", ")}.`);
