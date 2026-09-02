import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

/**
 * The header lets the page through, so its links sit on whatever is scrolling
 * past rather than on a ground we know. Contrast is therefore not a pair of
 * tokens that the unit test can compare - it has to be measured against the
 * pixels actually behind the letters.
 *
 * The measurement: the header's own content is hidden so that only its fill and
 * blur remain, the strip is captured, and the worst window the size of one
 * letter along the link row is taken. The worst of those, over every page and
 * every scroll position, is the contrast of the links.
 *
 * It is the wide header that is measured, because it is the only one with a row
 * of links: the narrow header carries a menu button instead. That is why this
 * file lives in `e2e/desktop` rather than in `e2e/shared`.
 *
 * The test knows no colour values - it asks the page what --nav-foreground
 * resolved to. Colour lives in the token file and nowhere else.
 */

/** Contrast has to clear the AA threshold for normal text. */
const THRESHOLD = 4.5;

/** The pages whose headings pass under the header. */
const PAGES = ["/", "/features/", "/pricing/"];

/** Scroll positions at which the first screen's heading crosses the links. */
const SCROLLS = [0, 60, 90, 120, 200];

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The link colour as the page resolved it, in relative luminance. */
async function linkLuminance(page: Page): Promise<number> {
  const rgb = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--nav-foreground)";
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  const parts = rgb.match(/\d+(\.\d+)?/g);
  expect(parts, `--nav-foreground did not resolve: ${rgb}`).not.toBeNull();
  const [r, g, b] = (parts ?? []).map(Number);
  return luminance(r ?? 0, g ?? 0, b ?? 0);
}

/**
 * The worst mean luminance over any window of `size` px in the strip. A
 * summed-area table makes every window cost the same four lookups, so the whole
 * sweep stays well inside a test's patience.
 */
function worstWindow(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  size: number,
  wanted: "darkest" | "lightest",
): number {
  const sum = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * channels;
      row += luminance(data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0);
      sum[(y + 1) * (width + 1) + x + 1] = (sum[y * (width + 1) + x + 1] ?? 0) + row;
    }
  }
  const area = size * size;
  let worst = wanted === "darkest" ? Infinity : -Infinity;
  for (let y = 0; y + size <= height; y += 1) {
    for (let x = 0; x + size <= width; x += 1) {
      const total =
        (sum[(y + size) * (width + 1) + x + size] ?? 0) -
        (sum[y * (width + 1) + x + size] ?? 0) -
        (sum[(y + size) * (width + 1) + x] ?? 0) +
        (sum[y * (width + 1) + x] ?? 0);
      const mean = total / area;
      worst = wanted === "darkest" ? Math.min(worst, mean) : Math.max(worst, mean);
    }
  }
  return worst;
}

for (const theme of ["light", "dark"] as const) {
  test(`header links keep their contrast in the ${theme} theme`, async ({ page }) => {
    test.slow();

    let worst = Number.POSITIVE_INFINITY;
    let where = "";

    for (const path of PAGES) {
      await page.goto(path);
      await page.evaluate((value) => {
        document.documentElement.setAttribute("data-theme", value);
      }, theme);

      const nav = page.locator("header nav").first();
      await expect(nav, "the wide header has no row of links to measure").toBeVisible();

      const link = await linkLuminance(page);
      // A window the size of one letter: the links' own font size.
      const size = await page.evaluate(() => {
        const first = document.querySelector("header nav a");
        return first === null
          ? 14
          : Math.round(parseFloat(getComputedStyle(first).fontSize));
      });
      const box = await nav.boundingBox();
      expect(box, "the link row has no box to measure").not.toBeNull();
      const clip = {
        x: Math.round(box?.x ?? 0),
        y: Math.round(box?.y ?? 0),
        width: Math.round(box?.width ?? 0),
        height: Math.round(box?.height ?? 0),
      };

      // Only the fill and the blur are left standing; what the shot shows is
      // exactly what ends up behind the letters.
      await page.addStyleTag({ content: "header * { visibility: hidden !important; }" });

      for (const offset of SCROLLS) {
        await page.evaluate((value) => window.scrollTo(0, value), offset);
        await page.waitForTimeout(150);
        const shot = await page.screenshot({ clip });
        const { data, info } = await sharp(shot)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const behind = worstWindow(
          data,
          info.width,
          info.height,
          info.channels,
          size,
          // The worst window is the one that closes on the link colour: the
          // darkest one under light links, the lightest under dark links.
          theme === "dark" ? "lightest" : "darkest",
        );
        const ratio = contrast(link, behind);
        if (ratio < worst) {
          worst = ratio;
          where = `${path} at ${offset}px`;
        }
      }
    }

    expect(
      worst,
      `the worst window is on ${where}; raise the fill density or move --nav-foreground`,
    ).toBeGreaterThanOrEqual(THRESHOLD);
  });
}
