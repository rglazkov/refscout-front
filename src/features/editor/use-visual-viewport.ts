"use client";

import * as React from "react";

/**
 * Where an overlay stands on a phone, and how tall it is.
 *
 * Both are measured from `window.visualViewport` rather than from the window,
 * because a keyboard does not change the window. It stands on top of it: the
 * layout viewport still covers the ground under the keys, and a panel sized and
 * placed against that viewport keeps a part of itself down there - the field,
 * the "Done" button, or the lines the person is proofreading.
 *
 * The height alone is not enough. A panel is centred in the box its insets
 * leave, so a short panel inside the full-height window is centred in the
 * window: as the keyboard comes up, the top of the editor travels down the
 * screen towards it and the lines above the cursor go with it. So the insets
 * are given as well, and they name the visual viewport - the part of the page
 * the person can actually see - which puts the panel back at the top of it.
 *
 * The fallback is `100dvh` and not `100vh`: with `vh` the address bar eats the
 * bottom of the field on every mobile browser that hides it on scroll.
 *
 * Proofreading on a phone is the main scenario, not an edge case, which is why
 * the viewport is handled from the start rather than left until the rest of the
 * editor is finished.
 */
export function useVisualViewportFrame(): React.CSSProperties {
  const [frame, setFrame] = React.useState<{
    readonly height: string;
    readonly top: string;
    readonly bottom: string;
  }>({ height: "100dvh", top: "0px", bottom: "0px" });

  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (viewport === null || viewport === undefined) return;

    const measure = () => {
      const top = Math.round(viewport.offsetTop);
      const height = Math.round(viewport.height);
      const next = {
        height: `${height}px`,
        top: `${top}px`,
        // What is left of the window below the visible part, which is where a
        // keyboard is when there is one.
        bottom: `${Math.max(0, Math.round(window.innerHeight) - top - height)}px`,
      };
      // Scrolling a phone fires this a hundred times with the same answer, and
      // every answer that is not a new one is a render of the whole editor.
      setFrame((current) =>
        current.height === next.height &&
        current.top === next.top &&
        current.bottom === next.bottom
          ? current
          : next,
      );
    };
    measure();
    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
    };
  }, []);

  /*
   * The height travels as a custom property because an inline `height` could
   * not then be narrowed by a breakpoint, and the insets travel as themselves
   * because they have to beat the panel's own `inset-0`.
   */
  return React.useMemo(
    () =>
      ({
        "--overlay-height": frame.height,
        top: frame.top,
        bottom: frame.bottom,
      }) as React.CSSProperties,
    [frame],
  );
}
