/**
 * The mark, as geometry rather than as markup.
 *
 * The component in `logo.tsx` draws it, and so does
 * `scripts/generate-brand-assets.mjs`, which rasterises the tab icon and the
 * social image at build time and cannot use a React component (§15). Written
 * once here, the two stay the same drawing - and this file holds no JSX so
 * that a plain Node script can read it.
 */
export const logoShapes = {
  viewBox: "0 0 24 24",
  strokeWidth: 2,
  circles: [{ cx: 10.5, cy: 10.5, r: 6.5 }],
  paths: ["m20 20-4.6-4.6", "M7.5 10.5h6", "M7.5 13.5h3.5"],
} as const;

/** The mark as SVG elements, for the build-time rasteriser. */
export function logoMarkup(): string {
  return [
    ...logoShapes.circles.map(
      (circle) => `<circle cx="${circle.cx}" cy="${circle.cy}" r="${circle.r}"/>`,
    ),
    ...logoShapes.paths.map((d) => `<path d="${d}"/>`),
  ].join("");
}
