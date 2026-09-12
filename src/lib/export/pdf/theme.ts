import { rgb, type RGB } from "pdf-lib";

/**
 * How the report looks on paper.
 *
 * The ink is the product's own, taken from the light theme: the same severity
 * red, the same amber, the same near-black text and the same border. A report
 * is what a person keeps after the tab is closed, and it should be
 * recognisably the same product they ran the checks in.
 *
 * Only the light theme is here, and there is no dark one. Paper has no theme,
 * and a reader who prefers a dark screen is not helped by a PDF that arrives
 * with a black page and prints as a black page.
 *
 * This is the one place in the product where a colour is written out as a value
 * instead of being taken from a CSS variable, and it is written as the variable
 * it copies so that the copy can be checked. A PDF has no stylesheet: the
 * writer needs three numbers per colour at the moment it draws, and there is
 * nothing to resolve a variable against. A test holds every line below to the
 * value the theme actually defines, so the two cannot drift apart - which is
 * the whole of what the rule against loose colours is protecting.
 */
export const light: Readonly<Record<string, string>> = {
  "--foreground": "#0c1614",
  "--muted-foreground": "#50615b",
  "--border": "#9fbfb9",
  "--muted": "#e4f0ed",
  "--card": "#fafffd",
  "--primary": "#0b7571",
  "--primary-soft": "#d3f3f0",
  "--critical": "#a02a26",
  "--critical-soft": "#ffeae8",
  "--critical-border": "#f4cbc6",
  "--warning": "#975f10",
  "--warning-soft": "#f9efde",
  "--warning-border": "#e3d4b6",
};

function ink(token: string): RGB {
  const value = Number.parseInt((light[token] ?? "").slice(1), 16);
  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  );
}

export const colour = {
  text: ink("--foreground"),
  muted: ink("--muted-foreground"),
  rule: ink("--border"),
  accent: ink("--primary"),
  accentSoft: ink("--primary-soft"),
  paper: ink("--card"),
} as const;

/**
 * The severity scale, as three complete looks rather than three colours.
 *
 * A finding on the screen is a card with a tinted ground, a border a shade
 * stronger, and an edge in the full colour; here it is the same three values
 * doing the same three jobs. That is what lets the words inside a finding be
 * words: how bad it is has already been said by the ground it stands on, so the
 * title does not have to be shouted, and the reader's eye can go to the name of
 * the document first, as it should.
 */
export const severity = {
  critical: {
    edge: ink("--critical"),
    fill: ink("--critical-soft"),
    border: ink("--critical-border"),
  },
  warning: {
    edge: ink("--warning"),
    fill: ink("--warning-soft"),
    border: ink("--warning-border"),
  },
  /** A note is not a warning, so it takes the quiet end of the scale. */
  info: {
    edge: ink("--muted-foreground"),
    fill: ink("--muted"),
    border: ink("--border"),
  },
} as const;

/**
 * A4, in the points a PDF is measured in. A4 rather than Letter because the
 * manuscripts this product is built for - dissertations, theses, papers for
 * European journals - are written on it, and a page that has to be scaled to
 * print is a page with a margin nobody chose.
 */
export const page = { width: 595.28, height: 841.89 } as const;

/**
 * The margins are wide on purpose. This is a document that gets read through
 * and written on, and the measure that comes out of them - about 480 points,
 * some ninety characters of the text face - is a line the eye can return from
 * without losing its place.
 */
export const margin = { top: 64, bottom: 60, left: 62, right: 62 } as const;

export const column = page.width - margin.left - margin.right;

/**
 * The type scale. Each size is named for what it sets rather than for how big
 * it is, so a change of mind about the look of a finding is a change in one
 * place and not a hunt for the number 10.5.
 */
export const size = {
  title: 23,
  produced: 9.5,
  /** The name of a document: the largest thing on the page it opens. */
  document: 18,
  counts: 9,
  /** A document named on the contents page. */
  contents: 12,
  /** The name of a check: a clear step below a document and above a finding. */
  check: 13,
  finding: 10.5,
  /** The severity, set small and in capitals, the way a badge is set. */
  badge: 7.5,
  place: 8.5,
  quote: 9.5,
  detail: 9,
  evidence: 8.5,
  footer: 8,
} as const;

/**
 * Leading, as a multiple of the size. Prose is set tight enough to read as a
 * block; a quotation is set looser, because it is somebody else's text set
 * inside ours and the extra air is what says so.
 */
export const leading = { prose: 1.35, quote: 1.5 } as const;

/** The air inside a panel, and how far a quotation stands off its own rule. */
export const pad = { panel: 10, quote: 9 } as const;

/**
 * The vertical rhythm, and it is the whole of the hierarchy.
 *
 * What the eye reaches first is decided here as much as by any type size: the
 * space above a check heading is three times the space between two findings, so
 * the findings read as belonging to it rather than as a list that happens to
 * follow it.
 */
export const gap = {
  afterTitle: 30,
  afterDocument: 20,
  beforeCheck: 24,
  afterCheckName: 6,
  afterCheckRule: 11,
  betweenFindings: 7,
  afterFindingTitle: 5,
  betweenPlaces: 4,
  betweenContents: 7,
  aroundQuote: 4,
  beforeDetail: 5,
} as const;
