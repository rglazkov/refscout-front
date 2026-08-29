import { converter, wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

import { brand } from "../../brand.config";
import {
  explicitDarkTokens,
  lightTokens,
  systemDarkTokens,
  themes,
} from "./utils/tokens";

/**
 * Contrast is computed by a test rather than judged by a reviewer's eye (§13,
 * M0.2). Accessibility degrades imperceptibly and comes back as complaints, so
 * the threshold is checked in both themes and on every pair - including the
 * card-against-ground step.
 */
function ratio(tokens: Readonly<Record<string, string>>, a: string, b: string): number {
  const first = tokens[a];
  const second = tokens[b];
  if (first === undefined || second === undefined) {
    throw new Error(`No such token: ${first === undefined ? a : b}`);
  }
  return wcagContrast(first, second);
}

/** Text on a background: the AA threshold. */
const textPairs: ReadonlyArray<readonly [string, string]> = [
  ["--foreground", "--background"],
  ["--foreground", "--card"],
  ["--foreground", "--muted"],
  ["--muted-foreground", "--background"],
  ["--muted-foreground", "--card"],
  ["--muted-foreground", "--muted"],
  ["--primary-foreground", "--primary"],
  ["--critical", "--critical-soft"],
  ["--warning", "--warning-soft"],
  ["--ok", "--ok-soft"],
  ["--primary", "--primary-soft"],
  ["--critical", "--card"],
  ["--warning", "--card"],
  ["--ok", "--card"],
  ["--primary", "--card"],
];

/** Borders and focus: the threshold for non-text elements. */
const uiPairs: ReadonlyArray<readonly [string, string]> = [
  ["--ring", "--background"],
  ["--ring", "--card"],
  ["--input", "--card"],
];

describe.each(themes)("contrast, %s theme", (_name, tokens) => {
  it.each(textPairs)("%s on %s is at least 4.5", (foreground, background) => {
    expect(ratio(tokens, foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(uiPairs)("%s on %s is at least 3", (foreground, background) => {
    expect(ratio(tokens, foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it("the page ground differs from the card", () => {
    // This is most often forgotten in the light theme, and the interface goes
    // flat with white cards on a near-white background (§14, M0.2.1).
    expect(ratio(tokens, "--card", "--background")).toBeGreaterThanOrEqual(1.15);
  });

  /**
   * The counter dots (§9). Two severities shown as two small circles have to be
   * told apart at a glance, and hue alone will not do it: a red-green
   * deficiency erases exactly that difference, and the text colours of the two
   * severities sit within one L* of each other because both are tuned to read
   * on their own tint. So the dots separate by lightness, and the ring - the
   * severity's text colour - is what gives each dot an edge on the card, on the
   * page ground and on a muted fill alike.
   */
  it("a dot has a defined edge on every surface it can sit on", () => {
    for (const ring of ["--critical", "--warning"]) {
      for (const surface of ["--card", "--background", "--muted"]) {
        expect(ratio(tokens, ring, surface)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("the two dots are far enough apart in lightness to separate without hue", () => {
    const lightness = (token: string) => {
      const value = tokens[token];
      if (value === undefined) throw new Error(`No such token: ${token}`);
      return (converter("oklch")(value)?.l ?? 0) * 100;
    };
    expect(
      Math.abs(lightness("--warning-dot") - lightness("--critical-dot")),
    ).toBeGreaterThanOrEqual(12);
  });

  it("the severity colours do not match the accent", () => {
    for (const severity of ["--critical", "--warning", "--ok"] as const) {
      expect(tokens[severity]).not.toBe(tokens["--primary"]);
    }
  });
});

describe("the dark theme is written identically in both copies", () => {
  it("the system copy and the explicit copy agree", () => {
    expect(systemDarkTokens).toEqual(explicitDarkTokens);
  });
});

describe("the address-bar colour", () => {
  it("matches the ground of each theme", () => {
    expect(brand.themeColor.light).toBe(lightTokens["--background"]);
    expect(brand.themeColor.dark).toBe(explicitDarkTokens["--background"]);
  });
});

describe("the mark on the tab icon and the social image", () => {
  // Written out in brand.config.ts because a PNG cannot hold a CSS variable.
  // Written out is how it drifts, so it is held to the tokens here.
  it("is the accent and the text on it", () => {
    expect(brand.mark.background).toBe(lightTokens["--primary"]);
    expect(brand.mark.foreground).toBe(lightTokens["--primary-foreground"]);
  });

  it("reads on its own tile in both themes", () => {
    // One image serves both themes, so the glyph has to clear the threshold
    // against its tile - not against whatever the tab strip happens to be.
    expect(wcagContrast(brand.mark.foreground, brand.mark.background)).toBeGreaterThan(3);
  });
});
