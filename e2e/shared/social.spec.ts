import { expect, test, type APIRequestContext } from "@playwright/test";
import sharp from "sharp";

import { brand } from "../../brand.config";

/**
 * What a shared link looks like on the five networks the product is passed
 * around on: Facebook, Instagram, WhatsApp, Telegram and X.
 *
 * Four of them read Open Graph - Instagram and WhatsApp through Facebook's own
 * crawler, Telegram through its own - and X reads the `twitter:` tags. None of
 * them runs JavaScript and none of them reports a mistake: a tag that is
 * missing, unparseable or relative produces a bare grey rectangle with a
 * domain in it, and nobody finds out until somebody shares the link. So the
 * tags are asserted on the built page rather than trusted to a helper that
 * type-checks.
 */
const pages = ["/", "/features/", "/pricing/", "/privacy/"];

async function head(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text();
  const tags = new Map<string, string[]>();
  for (const match of html.matchAll(/<meta [^>]*>/g)) {
    const name = /(?:property|name)="([^"]+)"/.exec(match[0])?.[1];
    const content = /content="([^"]*)"/.exec(match[0])?.[1];
    if (name === undefined || content === undefined) continue;
    tags.set(name, [...(tags.get(name) ?? []), content]);
  }
  return { one: (name: string) => (tags.get(name) ?? [])[0] };
}

for (const path of pages) {
  test(`page ${path} unfurls on every network`, async ({ request }) => {
    const meta = await head(request, path);

    // Open Graph: Facebook, Instagram, WhatsApp, Telegram.
    expect(meta.one("og:title")).toBeTruthy();
    expect(meta.one("og:description")).toBeTruthy();
    expect(meta.one("og:site_name")).toBe(brand.name);
    expect(meta.one("og:type")).toBe("website");
    // language_TERRITORY, not the bare tag: Facebook discards any other shape.
    expect(meta.one("og:locale")).toMatch(/^[a-z]{2}_[A-Z]{2}$/);

    // A crawler resolves nothing: a relative address is simply no picture.
    const image = meta.one("og:image");
    expect(image).toMatch(/^https?:\/\/.+\.png$/);
    expect(meta.one("og:image:secure_url")).toBe(image);
    expect(meta.one("og:image:type")).toBe("image/png");
    expect(meta.one("og:image:width")).toBe("1200");
    expect(meta.one("og:image:height")).toBe("630");
    expect(meta.one("og:image:alt")).toBeTruthy();
    expect(meta.one("og:url")).toMatch(/^https?:\/\//);

    // X reads its own tags first and only falls back to Open Graph.
    expect(meta.one("twitter:card")).toBe("summary_large_image");
    expect(meta.one("twitter:title")).toBe(meta.one("og:title"));
    expect(meta.one("twitter:description")).toBe(meta.one("og:description"));
    expect(meta.one("twitter:image")).toBe(image);
    expect(meta.one("twitter:image:alt")).toBe(meta.one("og:image:alt"));
  });
}

test("the shared picture survives every crop the networks make", async ({ request }) => {
  const response = await request.get("/opengraph-image.png");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");

  const png = await response.body();
  // WhatsApp stops showing a preview above roughly 300 kB and shows the bare
  // link instead, which is the strictest limit of the five.
  expect(png.byteLength).toBeLessThan(300_000);

  const { width, height } = await sharp(png).metadata();
  expect([width, height]).toEqual([1200, 630]);

  /**
   * Only Facebook and Telegram show the frame as it was drawn. X crops a
   * `summary_large_image` card to 2:1, and WhatsApp and Instagram crop the
   * thumbnail in a conversation to a square - so everything that must be seen
   * lives in the middle 630x630, inset by the rows the 2:1 crop takes off the
   * top and the bottom. Anything drawn outside that region is drawn for the
   * one network in five that shows the whole card.
   */
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const ground = [1, 3, 5].map((digit) =>
    parseInt(brand.themeColor.dark.slice(digit, digit + 2), 16),
  );

  const ink = { left: info.width, top: info.height, right: -1, bottom: -1 };
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixel = (y * info.width + x) * info.channels;
      if (ground.every((value, channel) => data[pixel + channel] === value)) continue;
      ink.left = Math.min(ink.left, x);
      ink.top = Math.min(ink.top, y);
      ink.right = Math.max(ink.right, x);
      ink.bottom = Math.max(ink.bottom, y);
    }
  }

  const side = (info.width - info.height) / 2;
  const row = (info.height - info.width / 2) / 2;
  expect(
    ink.left,
    "the lockup runs off the left of the square crop",
  ).toBeGreaterThanOrEqual(side);
  expect(ink.right, "the lockup runs off the right of the square crop").toBeLessThan(
    info.width - side,
  );
  expect(ink.top, "the lockup runs off the top of the 2:1 crop").toBeGreaterThanOrEqual(
    row,
  );
  expect(ink.bottom, "the lockup runs off the bottom of the 2:1 crop").toBeLessThan(
    info.height - row,
  );
});
