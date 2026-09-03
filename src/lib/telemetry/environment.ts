import type { Viewport } from "./events";

/**
 * The five facts every event carries about where it happened: which build, which
 * address, which language, which theme, and how big the window was.
 *
 * None of them is asked of the application. Telemetry reads them off the
 * document, because a module that has to be handed its context is a module that
 * gets one shape of context from the screen that remembered to pass it and
 * another from the one that did not - and the events being comparable is the
 * whole value of collecting them.
 */

/**
 * The build. It is baked in at build time under a public name, so the value in
 * a running page is the value of the bundle that page was served from, and
 * nothing at runtime can disagree with it.
 *
 * An unset one is said out loud rather than guessed at: "dev" is a true answer
 * about a build made on somebody's machine, and a made-up version number would
 * put local crashes in the same bucket as a released one.
 */
export const RELEASE: string = process.env.NEXT_PUBLIC_RELEASE ?? "dev";

/**
 * The address, without the query string and without the fragment. Neither is
 * dropped for tidiness: a search on this site puts what the person typed
 * nowhere near the address bar, but a link they arrived by can carry anything
 * at all, and an address copied whole is the easiest way for text nobody
 * intended to send to end up in a batch.
 */
export function route(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

/**
 * The language being read, taken from the document rather than from the
 * dictionary: `lang` is set by the layout of every page, and reading it here
 * keeps telemetry out of the internationalisation layer entirely.
 */
export function locale(): string {
  if (typeof document === "undefined") return "";
  return document.documentElement.lang;
}

/**
 * The theme on screen. Until somebody uses the switch there is no choice
 * recorded anywhere, and the appearance is decided by the media query in the
 * tokens - so the browser is asked, exactly as the toggle asks it.
 */
export function theme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  const chosen = document.documentElement.getAttribute("data-theme");
  if (chosen === "dark" || chosen === "light") return chosen;
  // Asking is guarded because collection may not fail. An environment without
  // media queries is a real one - a test runner, an embedded view - and a
  // missing appearance must cost the event its `theme` field and not the event.
  if (typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Rounded to whole pixels: a fractional viewport is a zoom level, not a size. */
export function viewport(): Viewport {
  if (typeof window === "undefined") return { w: 0, h: 0 };
  return {
    w: Math.round(window.innerWidth),
    h: Math.round(window.innerHeight),
  };
}
