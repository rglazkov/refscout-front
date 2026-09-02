import { logoShapes } from "./logo-shapes";

type LogoProps = {
  readonly className?: string;
  readonly title?: string;
};

/**
 * The logo is drawn with currentColor and knows nothing about the theme: in the
 * dark theme it takes its colour from the parent, like any icon. There is no
 * raster version of it in the repository - the tab icon and the social image
 * are rasterised from the same geometry at build time.
 */
export function Logo({ className, title }: LogoProps) {
  return (
    <svg
      className={className}
      viewBox={logoShapes.viewBox}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth={logoShapes.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title ? <title>{title}</title> : null}
      {logoShapes.circles.map((circle) => (
        <circle key={`${circle.cx},${circle.cy}`} {...circle} />
      ))}
      {logoShapes.paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
