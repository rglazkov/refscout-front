/**
 * Vendors the web fonts into `public/fonts` and regenerates `src/app/fonts.css`.
 *
 * Two things are true at once, and neither replaces the other.
 *
 * The files are committed, so a build never depends on a third party being
 * reachable: `npm run build` reads `public/fonts` off the disk and touches the
 * network nowhere. That is the invariant to protect in any future change, and
 * the reason this script is deliberately not wired into `prebuild` - a release
 * build that fetched would be a release build that a withdrawn package, a
 * changed release or an unreachable host could break or silently alter.
 *
 * And nobody has to track font versions either: `.github/workflows/fonts.yml`
 * runs this weekly and opens a pull request when a family has moved. So the
 * newest release still arrives on its own, but as a reviewed change with a
 * visible diff rather than as something that happened during a deploy. Run it
 * by hand with `npm run fonts` when a family needs updating sooner.
 *
 * Nothing is written until the whole set has downloaded. A half-updated set
 * would mix two releases of the same family across subsets.
 *
 * Every subset the upstream package publishes is taken, and the list is
 * discovered rather than written down here - so a language whose script these
 * families already cover (Latin, Cyrillic, Greek, Vietnamese) needs no change
 * to this file at all. Each subset carries its own `unicode-range`, so a page
 * downloads only the slices its characters actually need.
 *
 * Scripts these families do not cover - CJK, Arabic, Hebrew, Indic - resolve
 * through the fallback stacks in `tokens.css` to whatever the reader's system
 * provides. That is deliberate: a CJK web font is measured in megabytes, and a
 * manuscript in the editor must render whatever language it is written in.
 */
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `axis` names both the upstream stylesheet and the file suffix of the
 * variable files to take.
 *
 * Literata is taken on its `opsz` files rather than its `wght` ones. Those
 * carry the same weight range and the optical-size axis besides, and CSS
 * applies that axis to the font size on its own, so a heading is drawn with
 * display proportions and a footnote with text ones, instead of both being
 * one drawing scaled. Inter and JetBrains Mono publish no such axis.
 *
 * The axis is not free: carrying it doubles the file. The Latin subset goes
 * from 52 to 110 KB, and a reading page fetches that subset, so the choice
 * costs about 58 KB on the wire for prose that is drawn better. Changing
 * `opsz` back to `wght` on the line below buys the weight back and gives up
 * the drawing; the byte budgets count scripts only, so this trade-off is not
 * one the build will make for anybody.
 */
const FAMILIES = [
  { pkg: "inter", family: "Inter", axis: "wght" },
  { pkg: "literata", family: "Literata", axis: "opsz" },
  { pkg: "jetbrains-mono", family: "JetBrains Mono", axis: "wght", noItalic: true },
];

/**
 * The same three families again, as whole static TrueType files, for the
 * findings report.
 *
 * The report is a PDF, and a PDF carries its faces inside itself: there is no
 * stack to fall back through and no reader's system to borrow from, so a
 * character whose glyph is not embedded is a character that is simply not in
 * the file. Which is why these are not the files above. Those are variable and
 * cut into subsets by unicode-range - exactly right for a page, where the
 * browser fetches the slices the text needs and picks the weight off the axis,
 * and useless here: the embedder reads one file per face, cannot join subsets
 * back together, and cannot instance an axis. A whole file per weight is the
 * shape the format asks for.
 *
 * They are TrueType rather than woff2 because a PDF holds a font as the font
 * file itself, and TrueType is the shape it holds. A woff2 is that file
 * compressed and rearranged; embedded as-is it is not a font any reader can
 * open. Uncompressed the four come to about 900 KB, which is why no page
 * reaches for them: they are built into the worker that writes the report and
 * arrive once, with it.
 *
 * Google's own service is the source: it still serves a static instance to a
 * caller that does not announce woff2 support, and fontsource publishes subsets
 * alone. The scripts covered are therefore the families' own - Latin, Cyrillic,
 * Greek and Vietnamese - and a report quoting a manuscript in one of those is
 * set correctly. A quotation in a script none of them draws comes out as a row
 * of boxes: the writer substitutes a visible one per character rather than
 * leaving a gap where a word was.
 */
const PDF_FACES = [
  { file: "inter-400.ttf", query: "Inter:wght@400" },
  { file: "inter-600.ttf", query: "Inter:wght@600" },
  { file: "literata-400.ttf", query: "Literata:opsz,wght@7..72,400" },
  { file: "jetbrains-mono-400.ttf", query: "JetBrains+Mono:wght@400" },
];

/**
 * Google Fonts decides what to serve from the caller's user agent, and falls
 * back to a static TrueType file for a caller it does not recognise as a
 * browser. This is that caller, and it says what it is rather than pretending
 * to be an old browser: an agent naming a real one would be answered with woff2
 * - the files we already have and cannot embed - and one naming a very old one
 * would be answered with EOT, which nothing here can read at all.
 */
const VENDORING_AGENT = "font vendoring script";

/**
 * The face a reader sees for the fraction of a second before Literata
 * arrives, with its box bent to Literata's own metrics: without this the swap
 * is a visible jump of the whole page, and the jump is worst where there is
 * most text - the editor and the preview.
 *
 * Georgia is the match by measurement rather than by name - its average
 * character width and x-height are the closest among the faces present on
 * every desktop - and the numbers below are Literata's and Georgia's
 * published metrics run through the standard formula:
 *
 *  size-adjust = (xWidthAvg / unitsPerEm) of Literata over that of Georgia
 *  *-override = Literata's ascent, descent and line gap over its own
 *                unitsPerEm, divided again by size-adjust
 *
 * Literata: unitsPerEm 1000, ascent 1177, descent -308, lineGap 0, xWidthAvg 480.
 * Georgia:  unitsPerEm 2048, xWidthAvg 913.
 *
 * Georgia has not moved since 1993, but a Literata release could change its
 * average width, and that would not show up in this script's diff - so these
 * four numbers are recomputed by hand when a Literata release changes the
 * shape of the text. The interface faces get no such treatment on purpose:
 * what stands in for Inter is Segoe UI on Windows and the system face on
 * macOS, and one set of overrides cannot match both.
 *
 * The stack in tokens.css names this family straight after Literata. Where
 * Georgia is absent the face does not resolve at all and the stack carries on
 * to the unadjusted entries.
 */
const FALLBACK = `/* Literata - the stand-in until it loads, bent to Literata's metrics */
@font-face {
  font-family: "Literata Fallback";
  src: local("Georgia");
  size-adjust: 107.67%;
  ascent-override: 109.31%;
  descent-override: 28.61%;
  line-gap-override: 0%;
}`;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = path.join(root, "public", "fonts");
/** The whole faces the report embeds, kept apart from the subsets a page uses. */
const pdfFontsDir = path.join(fontsDir, "pdf");
const cssFile = path.join(root, "src", "app", "fonts.css");
const cdn = "https://cdn.jsdelivr.net/npm/@fontsource-variable";
const registry = "https://data.jsdelivr.com/v1/packages/npm/@fontsource-variable";

const get = async (url, headers = {}) => {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
};

/** Pulls one @font-face per subset out of an upstream stylesheet. */
function parseFaces(css, pkg, axis) {
  const faces = [];
  for (const [, body] of css.matchAll(/@font-face\s*\{(.*?)\}/gs)) {
    const file = body
      .match(/url\(([^)]*?)\)/)?.[1]
      ?.replace(/['"]/g, "")
      .split("/")
      .pop();
    const weight = body.match(/font-weight:\s*([^;]+);/)?.[1]?.trim();
    const range = body.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim();
    if (!file || !weight || !range || !file.includes(`-${axis}`)) continue;
    faces.push({
      file,
      weight,
      range,
      subset: file.split(`${pkg}-`)[1].split(`-${axis}`)[0],
    });
  }
  return faces;
}

function block(family, style, face) {
  return (
    `/* ${family} - ${style} - ${face.subset} */\n` +
    `@font-face {\n` +
    `  font-family: "${family}";\n` +
    `  font-style: ${style};\n` +
    `  font-weight: ${face.weight};\n` +
    `  font-display: swap;\n` +
    `  src: url("/fonts/${face.file}") format("woff2");\n` +
    `  unicode-range: ${face.range};\n` +
    `}`
  );
}

/** Downloads the complete set into memory. Throws rather than half-finishing. */
async function collect() {
  const blocks = [];
  const files = new Map();
  const versions = [];

  for (const { pkg, family, axis, noItalic } of FAMILIES) {
    const styles = noItalic
      ? { normal: axis }
      : { normal: axis, italic: `${axis}-italic` };
    const meta = await (await get(`${registry}/${pkg}`)).json();
    const version = meta.tags?.latest;
    if (!version) throw new Error(`no latest version published for ${pkg}`);
    versions.push(`${pkg}@${version}`);

    for (const [style, sheet] of Object.entries(styles)) {
      const css = await (await get(`${cdn}/${pkg}@${version}/${sheet}.css`)).text();
      const faces = parseFaces(css, pkg, axis);
      if (faces.length === 0) throw new Error(`no faces found in ${pkg} ${sheet}.css`);
      faces.sort((a, b) => a.subset.localeCompare(b.subset));

      for (const face of faces) {
        const res = await get(`${cdn}/${pkg}@${version}/files/${face.file}`);
        files.set(face.file, Buffer.from(await res.arrayBuffer()));
        blocks.push(block(family, style, face));
      }
    }
  }
  return { blocks, files, versions };
}

/** The whole static faces the report embeds, downloaded into memory. */
async function collectPdf() {
  const files = new Map();
  for (const { file, query } of PDF_FACES) {
    const res = await get(`https://fonts.googleapis.com/css2?family=${query}`, {
      "user-agent": VENDORING_AGENT,
    });
    const url = (await res.text()).match(/url\((https:\/\/[^)]*?\.ttf)\)/)?.[1];
    if (!url) throw new Error(`no static TrueType file offered for ${query}`);
    files.set(file, Buffer.from(await (await get(url)).arrayBuffer()));
  }
  return files;
}

async function haveUsableCopy() {
  try {
    const onDisk = await readdir(fontsDir);
    return onDisk.some((f) => f.endsWith(".woff2"));
  } catch {
    return false;
  }
}

let result;
let pdfFiles;
try {
  result = await collect();
  pdfFiles = await collectPdf();
} catch (error) {
  if (await haveUsableCopy()) {
    console.warn(`  fonts: upstream unavailable (${error.message})`);
    console.warn("  fonts: keeping the committed copies in public/fonts");
    process.exit(0);
  }
  console.error("  fonts: upstream unavailable and no local copy to fall back on");
  throw error;
}

const { blocks, files, versions } = result;
await mkdir(fontsDir, { recursive: true });
for (const [name, body] of files) await writeFile(path.join(fontsDir, name), body);

await mkdir(pdfFontsDir, { recursive: true });
for (const [name, body] of pdfFiles) await writeFile(path.join(pdfFontsDir, name), body);

/*
 * A subset dropped upstream must not linger as an unreferenced file. The sweep
 * goes by extension rather than by "everything that is not in the map", because
 * the two sets live one inside the other: `pdf` is a directory in the middle of
 * the woff2 files, and a sweep that did not know that would try to delete it.
 */
for (const [directory, kept, extension] of [
  [fontsDir, files, ".woff2"],
  [pdfFontsDir, pdfFiles, ".ttf"],
]) {
  for (const name of await readdir(directory)) {
    if (name.endsWith(extension) && !kept.has(name)) {
      await rm(path.join(directory, name));
      console.log(`  fonts: removed stale ${name}`);
    }
  }
}

const header =
  `/* Generated by scripts/sync-fonts.mjs - do not edit by hand.\n` +
  ` * Sources: ${versions.join(", ")}\n` +
  ` *\n` +
  ` * The files live in \`public/fonts\` and are committed, so a build succeeds\n` +
  ` * with no network. Each subset keeps its own unicode-range, so a page fetches\n` +
  ` * only the slices its characters need: an English page never downloads the\n` +
  ` * Cyrillic or Greek ones, and a manuscript that uses them renders in the\n` +
  ` * right face.\n` +
  ` *\n` +
  ` * The last face is not a family of ours: it is Georgia with its box bent\n` +
  ` * to Literata metrics, so the moment the web font arrives is not a jump\n` +
  ` * of the whole page.\n` +
  ` */\n\n`;

await writeFile(cssFile, header + [...blocks, FALLBACK].join("\n\n") + "\n", "utf8");
const kb = (entries) =>
  ([...entries].reduce((n, b) => n + b.length, 0) / 1024).toFixed(0);
console.log(
  `  fonts: ${blocks.length} faces, ${files.size} files, ` +
    `${kb(files.values())} KB from ${versions.join(", ")}`,
);
console.log(
  `  fonts: ${pdfFiles.size} whole faces for the report, ${kb(pdfFiles.values())} KB`,
);
