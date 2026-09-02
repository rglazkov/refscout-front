/**
 * The settings of the checks. They belong to a document rather than to the job:
 * two manuscripts in one buffer are two manuscripts with two subject areas and
 * two key formats, and a single job-wide snapshot could not describe that. The
 * snapshot is sent in full with every document, so that a re-run inside the job
 * is unambiguous.
 */
export type CheckOptions = {
  readonly bibcheck: {
    readonly verifyLive: boolean;
    readonly showOrphans: boolean;
    readonly unifyKeys: boolean;
    readonly keyFormat:
      "author-year" | "author-year-title" | "author-title-year" | "numeric";
    readonly sortBy: "author" | "year" | "title" | "key" | "cited-order" | "original";
    readonly countCommented: boolean;
  };
  readonly glossary: { readonly domain?: string };
  readonly presubmit: { readonly anonymity: boolean };
  /**
   * Cite reads a piece of writing and proposes sources for the claims in it.
   * `source` says which piece: the whole document the check is ticked on, or a
   * paragraph or draft section pasted into the box on the card. The excerpt is
   * carried here because it is a setting of this document's Cite run and of
   * nothing else, and it is the text the answer will be about.
   */
  readonly cite: {
    readonly source: "document" | "excerpt";
    readonly excerpt?: string;
    readonly maxPerClaim: number;
    readonly instructions?: string;
  };
};

/**
 * What a document arrives with. Every field the product has is here from the
 * start; they simply stop being the first thing a person sees, and live in the
 * "configure" disclosure on the document's own card.
 */
export const defaultOptions: CheckOptions = {
  bibcheck: {
    verifyLive: true,
    showOrphans: true,
    unifyKeys: false,
    keyFormat: "author-year",
    sortBy: "author",
    countCommented: false,
  },
  glossary: {},
  presubmit: { anonymity: true },
  cite: { source: "document", maxPerClaim: 3 },
};
