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
const cssFile = path.join(root, "src", "app", "fonts.css");
const cdn = "https://cdn.jsdelivr.net/npm/@fontsource-variable";
const registry = "https://data.jsdelivr.com/v1/packages/npm/@fontsource-variable";

const get = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
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

async function haveUsableCopy() {
  try {
    const onDisk = await readdir(fontsDir);
    return onDisk.some((f) => f.endsWith(".woff2"));
  } catch {
    return false;
  }
}

let result;
try {
  result = await collect();
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

// A subset dropped upstream must not linger as an unreferenced file.
for (const name of await readdir(fontsDir)) {
  if (!files.has(name)) {
    await rm(path.join(fontsDir, name));
    console.log(`  fonts: removed stale ${name}`);
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
const bytes = [...files.values()].reduce((n, b) => n + b.length, 0);
console.log(
  `  fonts: ${blocks.length} faces, ${files.size} files, ` +
    `${(bytes / 1024).toFixed(0)} KB from ${versions.join(", ")}`,
);
