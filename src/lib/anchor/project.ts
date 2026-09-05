import { projectOffset, snapshotOf } from "@/lib/docs";
import { asDocOffset, type Anchor, type CpOffset, type DocOffset } from "@/lib/domain";

import { type ProjectedAnchor } from "./resolve";
import { toDocOffset, withinDocument, type AstralIndex } from "./units";

/**
 * The two steps that stand between a number in an answer and a position in the
 * document on screen, done once each and in one place.
 *
 * The first is the unit. A module counts in code points because that is what
 * the contract says and what a length in Python is; a string in a browser is
 * counted in UTF-16 units, and on a thesis with a mathematical alphabet in it
 * the two part company by one per character. The second is time: the answer
 * describes the text as it was sent, and the person may have been correcting it
 * ever since.
 *
 * Doing both here, before the resolver is given anything, is what keeps them
 * from being done twice or half-done in a branch nobody tested. Below this
 * point every number is a position in the live text, and the resolver has no
 * idea that any other kind exists.
 */

/**
 * One place, converted and caught up. Everything that can be rejected outright
 * is rejected here rather than searched for: an offset that is not a position
 * in any document, and a quote that is not as long as the range it describes.
 * Neither is clamped into range - a clamp turns a broken answer into a
 * plausible point at the edge of the document, which reads as a result.
 */
export function projectAnchor(anchor: Anchor, ownDocId: string): ProjectedAnchor {
  const docId = anchor.docId ?? ownDocId;
  if (anchor.kind === "document" || anchor.kind === "unknown") {
    return { kind: "none", docId };
  }
  if (anchor.kind === "bibkey") {
    return { kind: "bibkey", docId, bibkey: anchor.bibkey };
  }

  const snapshot = snapshotOf(docId);
  if (snapshot === undefined) return { kind: "none", docId };
  const astral: AstralIndex = snapshot.astral;
  /*
   * `side` is which way an offset standing exactly where something was typed
   * should go. A start takes the text after the insertion and an end stops
   * before it, so a paragraph typed in immediately after a quoted sentence does
   * not become part of the sentence the module judged.
   */
  const live = (offset: CpOffset, side: 1 | -1 = 1): DocOffset =>
    asDocOffset(projectOffset(docId, toDocOffset(astral, offset), side));

  if (anchor.kind === "quote") {
    return {
      kind: "quote",
      docId,
      quote: anchor.quote,
      ...(anchor.prefix === undefined ? {} : { prefix: anchor.prefix }),
      ...(anchor.suffix === undefined ? {} : { suffix: anchor.suffix }),
      ...(anchor.near === undefined ? {} : { near: live(anchor.near) }),
    };
  }

  if (anchor.kind === "point") {
    const usable = withinDocument(anchor.at, anchor.at, snapshot.cpLength);
    return {
      kind: "point",
      docId,
      at: usable ? live(anchor.at) : asDocOffset(0),
      ...(anchor.prefix === undefined ? {} : { prefix: anchor.prefix }),
      ...(anchor.suffix === undefined ? {} : { suffix: anchor.suffix }),
      ...(usable ? {} : { failure: "OUT_OF_BOUNDS" as const }),
    };
  }

  const usable = withinDocument(anchor.from, anchor.to, snapshot.cpLength);
  const failure = !usable
    ? ("OUT_OF_BOUNDS" as const)
    : anchor.quoteMismatch === true
      ? ("QUOTE_LENGTH_MISMATCH" as const)
      : undefined;
  return {
    kind: "range",
    docId,
    from: usable ? live(anchor.from) : asDocOffset(0),
    to: usable ? live(anchor.to, -1) : asDocOffset(0),
    quote: anchor.quote,
    ...(anchor.prefix === undefined ? {} : { prefix: anchor.prefix }),
    ...(anchor.suffix === undefined ? {} : { suffix: anchor.suffix }),
    ...(failure === undefined ? {} : { failure }),
  };
}
