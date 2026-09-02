"use client";

import * as React from "react";

/**
 * The height of the overlay on a phone. Measured from `window.visualViewport`
 * rather than from the window, because when the keyboard is up the window has
 * not changed size and the layout viewport still covers the ground the keyboard
 * is standing on - so the field and the "Done" button end up underneath it.
 *
 * The fallback is `100dvh` and not `100vh`: with `vh` the address bar eats the
 * bottom of the field on every mobile browser that hides it on scroll.
 *
 * Proofreading on a phone is the main scenario, not an edge case, which is why
 * the viewport height is handled from the start rather than left until the rest
 * of the editor is finished.
 */
export function useVisualViewportHeight(): string {
  const [height, setHeight] = React.useState("100dvh");

  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null || viewport === undefined) return;

    const measure = () => setHeight(`${Math.round(viewport.height)}px`);
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  return height;
}
