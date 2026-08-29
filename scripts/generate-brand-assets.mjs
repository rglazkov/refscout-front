import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";
import { decompress } from "wawoff2";

import { brand } from "../brand.config.ts";
import { logoMarkup, logoShapes } from "../src/lib/brand/logo-shapes.ts";

/**
 * The tab icon and the social image, drawn from the brand config at build time
 * (§15). They are not files somebody exported once and nobody can regenerate:
 * change the mark, its colour or the name, and the next build redraws them.
 * That is also why `public/` does not carry them in the repository - they are
 * output, and .gitignore says so.
 *
 * Rasterising happens here rather than through a Next metadata route because a
 * static export names such a route without a file extension, and a host serving
 * `/opengraph-image` with no extension hands a crawler an octet-stream. A real
 * `.png` needs no host to be configured into agreeing that it is an image.
 *
 * The output is identical on every machine: the geometry comes from
 * `logo-shapes.ts`, and the one piece of lettering is set from the font file in
 * this repository rather than from whatever the build host has installed.
 */
const PUBLIC = "public";

/** The mark on its own tile: a tab strip is light in one browser, dark in the next. */
function tile(size, radius, inset) {
  const scale = (size - inset * 2) / 24;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"`,
    ` viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${brand.mark.background}"/>`,
    `<g transform="translate(${inset} ${inset}) scale(${scale})" fill="none"`,
    ` stroke="${brand.mark.foreground}" stroke-width="${logoShapes.strokeWidth}"`,
    ` stroke-linecap="round" stroke-linejoin="round">${logoMarkup()}</g>`,
    `</svg>`,
  ].join("");
}

/** The same tile without its own document, for placing inside a larger drawing. */
function tileContents(size) {
  return tile(size, Math.round(size * 0.225), Math.round(size * 0.18))
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
}

/**
 * The unfurled link: 1200x630, the usual size, and the one every network the
 * product is shared on reads - Facebook and the two crawlers that share its
 * infrastructure, Instagram and WhatsApp, plus Telegram and X.
 *
 * Three of those five do not show the picture as it is drawn. X crops a
 * `summary_large_image` card to 2:1, and WhatsApp and Instagram crop the
 * thumbnail in a conversation to a square. So the whole lockup is fitted into
 * the centre square rather than laid out across the width: what survives every
 * crop is the middle 630x630, and anything placed outside it is drawn for the
 * one network that shows the full frame.
 */
const CARD = { width: 1200, height: 630 };

/** The fraction of the crop-safe square the lockup is allowed to fill. */
const LOCKUP_FILL = 0.9;

/**
 * The brand name is set in Inter at the header's own values - `font-semibold`
 * and `tracking-tight` - so the shared card and the top of the site are the
 * same lockup rather than two drawings of it.
 */
const WORDMARK = {
  file: join(PUBLIC, "fonts", "inter-latin-wght-normal.woff2"),
  weight: 600,
  /** In em, matching Tailwind's `tracking-tight`. */
  tracking: -0.025,
};

/**
 * libvips sets text with the font file it is handed, and only if it is handed
 * one it can read. A `.woff2` it cannot: it is ignored without a word, and the
 * name is then drawn in whatever face the build host happens to have installed
 * - the machine-dependent output this script exists to avoid. So the vendored
 * subset is decompressed to a TrueType file first.
 *
 * It is decompressed rather than vendored a second time as a `.ttf`, because
 * the card must be set in the face the site actually serves. A second file from
 * a second upstream is a second version to keep in step, and the day they part
 * company nothing says so.
 */
async function truetype(directory) {
  const path = join(directory, "wordmark.ttf");
  writeFileSync(path, Buffer.from(await decompress(readFileSync(WORDMARK.file))));
  return path;
}

/** The name as a transparent raster, `pixels` tall in em. */
function wordmark(pixels, fontfile) {
  const tracking = Math.round(WORDMARK.tracking * 10 * 1024);
  const span = [
    `<span foreground="${brand.mark.foreground}"`,
    ` weight="${WORDMARK.weight}" letter_spacing="${tracking}">`,
    brand.name,
    `</span>`,
  ].join("");

  return sharp({
    text: {
      text: span,
      // Pango sizes text in points, so the resolution is what turns the
      // default ten points into the pixel height asked for here.
      dpi: Math.round(pixels * 7.2),
      font: "Inter",
      fontfile,
      rgba: true,
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true });
}

/**
 * Mark and name side by side, centred, scaled together until they fit the
 * crop-safe square. The scaling is measured rather than tabulated: a longer
 * name - or a translated one - shrinks the lockup instead of running out of
 * the square.
 */
async function social(fontfile) {
  const safe = Math.round(CARD.height * LOCKUP_FILL);
  const layout = async (size) => {
    const name = await wordmark(Math.round(size * 0.43), fontfile);
    const gap = Math.round(size * 0.23);
    return { size, gap, name, width: size + gap + name.info.width };
  };

  let lockup = await layout(200);
  if (lockup.width > safe) lockup = await layout(Math.round((200 * safe) / lockup.width));

  const left = Math.round((CARD.width - lockup.width) / 2);
  const ground = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}"`,
    ` viewBox="0 0 ${CARD.width} ${CARD.height}">`,
    `<rect width="${CARD.width}" height="${CARD.height}" fill="${brand.themeColor.dark}"/>`,
    `<g transform="translate(${left} ${Math.round((CARD.height - lockup.size) / 2)})">`,
    tileContents(lockup.size),
    `</g></svg>`,
  ].join("");

  return sharp(Buffer.from(ground)).composite([
    {
      input: lockup.name.data,
      left: left + lockup.size + lockup.gap,
      top: Math.round((CARD.height - lockup.name.info.height) / 2),
    },
  ]);
}

const scratch = mkdtempSync(join(tmpdir(), "refscout-brand-"));
try {
  const assets = [
    { file: "icon.png", image: sharp(Buffer.from(tile(64, 14, 8))) },
    { file: "apple-icon.png", image: sharp(Buffer.from(tile(180, 40, 26))) },
    { file: "opengraph-image.png", image: await social(await truetype(scratch)) },
  ];

  mkdirSync(PUBLIC, { recursive: true });
  for (const { file, image } of assets) {
    const png = await image.png({ compressionLevel: 9 }).toBuffer();
    writeFileSync(join(PUBLIC, file), png);
    console.log(`brand asset: ${file} (${png.length} bytes)`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
