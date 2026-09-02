import { wcagContrast } from "culori";
import { describe, expect, it } from "vitest";

import { brand } from "../../brand.config";
import {
  explicitDarkTokens,
  lightTokens,
  systemDarkTokens,
  themes,
} from "./utils/tokens";

/**
 * Contrast is computed by a test rather than judged by a reviewer's eye.
 * Accessibility degrades imperceptibly and comes back as complaints, so the
 * threshold is checked in both themes and on every pair - including the
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
  /*
   * The syntax palette is ink on the editor's own surface, which is the card.
   * It is held to the text threshold rather than to the one for decoration: a
   * field name in a bibliography is read, and it is read for as long as the
   * proof-reading takes.
   */
  ["--syntax-keyword", "--card"],
  ["--syntax-name", "--card"],
  ["--syntax-string", "--card"],
  ["--syntax-number", "--card"],
  /*
   * And the same ink on the fill under a selection. Selecting a paragraph is
   * how a person reads it again, copies it or replaces it, so the text under
   * the fill is read for exactly as long as the text beside it - which a fill
   * mixed towards the middle of the scale makes impossible, in one theme or the
   * other.
   */
  ["--foreground", "--editor-selection"],
  ["--syntax-keyword", "--editor-selection"],
  ["--syntax-name", "--editor-selection"],
  ["--syntax-string", "--editor-selection"],
  ["--syntax-number", "--editor-selection"],
];

/** Borders and focus: the threshold for non-text elements. */
const uiPairs: ReadonlyArray<readonly [string, string]> = [
  ["--ring", "--background"],
  ["--ring", "--card"],
  ["--input", "--card"],
  // The line around a selection is what makes it unmistakable, so it is the
  // part held to the threshold for shapes rather than the fill it encloses.
  ["--editor-selection-line", "--editor-selection"],
];

describe.each(themes)("contrast, %s theme", (_name, tokens) => {
  it.each(textPairs)("%s on %s is at least 4.5", (foreground, background) => {
    expect(ratio(tokens, foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(uiPairs)("%s on %s is at least 3", (foreground, background) => {
    expect(ratio(tokens, foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it("a selection is visible on the surface it sits on", () => {
    // Low enough to leave the text its contrast, high enough that a selection
    // made and then looked away from is still findable. The fill and the card
    // are on the same side of the scale by design, so this step is small and
    // the line above carries the rest.
    expect(ratio(tokens, "--editor-selection", "--card")).toBeGreaterThanOrEqual(1.4);
  });

  it("the page ground differs from the card", () => {
    // This is most often forgotten in the light theme, and the interface goes
    // flat with white cards on a near-white background.
    expect(ratio(tokens, "--card", "--background")).toBeGreaterThanOrEqual(1.15);
  });

  /**
   * A secondary control has to be seen against whatever it stands on, and the
   * two things it stands on are far apart. One shared fill cannot do both: it
   * clears one surface exactly by merging with the other, which is what a
   * shared --muted did in the dark theme. So each control surface is checked
   * against its own parent, and the label is checked on top of it.
   */
  it.each([
    ["--control-ground", "--background"],
    ["--control-card", "--card"],
    ["--control-ground-hover", "--background"],
    ["--control-card-hover", "--card"],
  ])("%s stands out from %s", (control, parent) => {
    expect(ratio(tokens, control, parent)).toBeGreaterThanOrEqual(1.25);
  });

  it.each([
    ["--foreground", "--control-ground"],
    ["--foreground", "--control-card"],
  ])("%s on %s is at least 4.5", (foreground, control) => {
    expect(ratio(tokens, foreground, control)).toBeGreaterThanOrEqual(4.5);
  });

  /**
   * The severity scale is one scale: the badge, the bar, the panel and the
   * counter dot all read from --critical and --warning, and there is no second,
   * brighter set beside it. The two dots are told apart by form - filled and
   * ringed - rather than by colour, so nothing here has to hold them apart.
   */
  it("there is no second severity scale to drift from the first", () => {
    for (const token of ["--critical-dot", "--warning-dot"]) {
      expect(tokens[token]).toBeUndefined();
    }
  });

  it("the syntax palette is not the severity scale wearing another name", () => {
    // Colour carries meaning in this product: a red word is a problem. A field
    // name is not a problem, so the palette that paints one shares no value
    // with the scale that paints the other, nor with the accent.
    const syntax = [
      "--syntax-keyword",
      "--syntax-name",
      "--syntax-string",
      "--syntax-number",
    ];
    const meaning = ["--critical", "--warning", "--ok", "--primary"];
    for (const role of syntax) {
      for (const scale of meaning) {
        expect(tokens[role]).not.toBe(tokens[scale]);
      }
    }
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
