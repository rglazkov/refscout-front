// @vitest-environment jsdom
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useVisualViewportFrame } from "@/features/editor/use-visual-viewport";

/**
 * Where an overlay stands while a keyboard is up.
 *
 * A phone keyboard does not shorten the window: it stands on top of it. So a
 * panel that is as tall as the visible part of the screen but placed inside the
 * whole window is centred between the two, which walks the top of the editor
 * down towards the keyboard and takes with it every line the person was reading
 * above the one they are typing on. It is invisible to any test that does not
 * put a keyboard up and then measure where the panel is, so it is measured.
 */
afterEach(cleanup);

/** The visible part of the screen, and a keyboard that can be raised over it. */
function keyboard(window: Window & typeof globalThis) {
  const listeners = new Set<() => void>();
  const viewport = {
    height: 800,
    offsetTop: 0,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    get: () => viewport,
  });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  return {
    raise(px: number, scrolledBy = 0) {
      viewport.height = 800 - px;
      viewport.offsetTop = scrolledBy;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

function Panel() {
  const frame = useVisualViewportFrame();
  return <div data-testid="panel" style={frame} />;
}

function frameOf(): { height: string; top: string; bottom: string } {
  const panel = document.querySelector<HTMLElement>("[data-testid=panel]");
  if (panel === null) throw new Error("the panel is not on the screen");
  return {
    height: panel.style.getPropertyValue("--overlay-height"),
    top: panel.style.top,
    bottom: panel.style.bottom,
  };
}

describe("the overlay stands against the visible part of the screen", () => {
  it("fills the window when there is no keyboard", () => {
    keyboard(window);
    render(<Panel />);
    expect(frameOf()).toEqual({ height: "800px", top: "0px", bottom: "0px" });
  });

  it("keeps its top where it was when the keyboard comes up", () => {
    const phone = keyboard(window);
    render(<Panel />);
    phone.raise(340);

    // The height is the visible part, and the inset below is the ground the
    // keyboard is standing on. Both are needed: the height alone leaves the
    // panel centred in the window, a third of the screen further down.
    expect(frameOf()).toEqual({ height: "460px", top: "0px", bottom: "340px" });
  });

  it("follows the visible part when the browser scrolls it", () => {
    const phone = keyboard(window);
    render(<Panel />);
    phone.raise(340, 120);

    expect(frameOf()).toEqual({ height: "460px", top: "120px", bottom: "220px" });
  });

  it("gives the window back when the keyboard goes away", () => {
    const phone = keyboard(window);
    render(<Panel />);
    phone.raise(340);
    phone.raise(0);

    expect(frameOf()).toEqual({ height: "800px", top: "0px", bottom: "0px" });
  });
});
