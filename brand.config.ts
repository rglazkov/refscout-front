/**
 * The brand is a swappable layer. This file lives outside `src/` because the
 * product name never appears inside `src/`: test M0.4.4 greps the source for
 * it, and rebranding has to be an edit to one file rather than to a hundred
 * components (M0.3.3).
 *
 * In the dictionaries the name is substituted through the {brandName}
 * parameter instead of being written into the text. The absolute site address
 * is not here - it comes from the NEXT_PUBLIC_SITE_URL environment variable,
 * because staging and production differ.
 */
export const brand = {
  name: "RefScout",
  supportEmail: "support@refscout.app",
  /** Legal entity shown on the /privacy page. */
  legalEntity: "Insectivora Oy",
  /**
   * The browser address-bar colour for each theme. This is the only place
   * outside src/app/tokens.css where a colour is written as a literal value:
   * <meta name="theme-color"> is HTML, and a CSS variable cannot be
   * substituted into it. The values must match --background of both themes,
   * which a test verifies.
   */
  themeColor: {
    light: "#c9dfda",
    dark: "#031513",
  },
  /**
   * The tab icon and the social image are rasterised at build time (§15), and
   * a PNG cannot hold a CSS variable any more than a <meta> tag can - which is
   * the same reason themeColor is written out above. The two values are the
   * light theme's --primary and --primary-foreground, and a test holds them to
   * it. One image serves both themes: the tile carries its own ground, so it
   * does not depend on the colour of the tab strip behind it.
   */
  mark: {
    background: "#0b7571",
    foreground: "#ffffff",
  },
  /**
   * The accounts a shared link is attributed to. Only X reads one: it prints
   * the handle on the card as the publisher, through `twitter:site`. Facebook,
   * Instagram, WhatsApp and Telegram attribute a card to the domain and ask
   * for nothing here.
   *
   * Empty while there is no account, and the tag is then left out rather than
   * written empty - a card unfurls perfectly well without it. Filling this in
   * is the whole of what registering a handle costs us (§15).
   */
  social: {
    /** The handle with its @, e.g. "@refscout". */
    x: "",
  },
} as const;

export type Brand = typeof brand;
