"use client";

import * as React from "react";

/**
 * The scrolled text dissolving at an edge that still has something behind it,
 * written once for every surface in the editor that scrolls.
 *
 * There are two of those and they are built out of different things - the
 * source is a virtualised editor whose scroller belongs to the library, the
 * page is an ordinary element - so each attaches the fade in its own way. What
 * they must not do is fade differently: the person switches between them
 * several times while reading one document, and an edge that dissolves over a
 * line in one and is cut across a line in the other reads as a change of
 * surface rather than a change of view. So the distance, the two properties and
 * the gradient itself are stated here and nowhere else.
 *
 * A mask dims every pixel under it, and at an edge with nothing behind it that
 * would be dimming for no reason - a caret on the first line drawn at a
 * fraction of its colour, a heading at the top of a page reading as a smear. So
 * each edge is switched on only while it is hiding something: a distance of
 * zero puts the two gradient stops in the same place and leaves that edge fully
 * opaque.
 */

/** How far the text dissolves at an edge that has more text behind it. */
export const FADE_PX = 20;

/** The distances the mask reads, written onto the scroller itself. */
const TOP = "--fade-top";
const BOTTOM = "--fade-bottom";

/**
 * The mask, as one declaration. About one line's worth at each end, which is
 * enough to read as "there is more above" without hiding a line still being
 * read.
 */
export const EDGE_FADE_MASK = `linear-gradient(to bottom, transparent 0, black var(${TOP}, 0px), black calc(100% - var(${BOTTOM}, 0px)), transparent 100%)`;

/** Which edges have text behind them, and so have something to fade. */
export type HiddenEdges = { readonly top: boolean; readonly bottom: boolean };

/**
 * Asking the question and answering it are two functions rather than one,
 * because one of the two callers may not do both at once: a virtualised editor
 * offers a phase for reading its geometry and a phase for writing to it, and
 * reading inside the writing one forces the layout to be computed again in the
 * middle of a cycle.
 */
export function hiddenEdges(element: HTMLElement): HiddenEdges {
  // A pixel of slack: a fractional scroll offset or content height would
  // otherwise leave a fade standing at an edge that is already flush.
  return {
    top: element.scrollTop > 1,
    bottom: element.scrollTop + element.clientHeight < element.scrollHeight - 1,
  };
}

/** Writes onto a scroller which of its edges is hiding text. */
export function writeEdgeFade(element: HTMLElement, at: HiddenEdges): void {
  element.style.setProperty(TOP, at.top ? `${FADE_PX}px` : "0px");
  element.style.setProperty(BOTTOM, at.bottom ? `${FADE_PX}px` : "0px");
}

/**
 * The same fade on an ordinary scrolling element, as a ref to put on it.
 *
 * Scrolling is not the only thing that changes which edges are hiding
 * something: the page is drawn a moment after the element appears, because the
 * markdown parser is fetched on the way to it, and a document that arrives into
 * a box whose own size never changed has to be noticed some other way. So the
 * box is watched for resizing and its contents for being replaced.
 */
export function useEdgeFade(): (node: HTMLElement | null) => (() => void) | undefined {
  return React.useCallback((node: HTMLElement | null) => {
    if (node === null) return;
    const measure = () => writeEdgeFade(node, hiddenEdges(node));
    node.addEventListener("scroll", measure, { passive: true });
    const resized = new ResizeObserver(measure);
    resized.observe(node);
    const filled = new MutationObserver(measure);
    filled.observe(node, { childList: true, subtree: true, characterData: true });
    measure();
    return () => {
      node.removeEventListener("scroll", measure);
      resized.disconnect();
      filled.disconnect();
    };
  }, []);
}
