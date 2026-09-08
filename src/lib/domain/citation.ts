/**
 * One entry of a bibliography, with the fields a bibliography actually carries.
 *
 * It is a second shape beside `BiblioRecord` rather than a widening of it,
 * because the two answer different questions and are filled by different
 * things. `BiblioRecord` is what a search hands back about a work somebody
 * might cite - a title, who wrote it, how often it is cited, whether it is open
 * access - and it is drawn on a card. This is what an entry of somebody's own
 * bibliography holds once it has been read: the volume, the issue, the pages,
 * the publisher, the kind of work it is. Writing that file out in another
 * bibliographic format needs all of it, and a conversion that went through the
 * card's shape would hand the person back a bibliography with the pages missing
 * from every entry.
 *
 * Every field is optional but the type, because every field is optional in the
 * file this is read from. What is not there is not written out - an empty
 * `volume` in a reference manager reads as a fact.
 */
export type CitationRecord = {
  /**
   * What kind of work it is, in the vocabulary of CSL - `article-journal`,
   * `paper-conference`, `book`, `chapter`, `thesis`. It is kept in the
   * vocabulary the reader produced rather than translated on the way in: the
   * writer that needs another vocabulary translates it once, at the point where
   * it knows what it is writing.
   */
  readonly type: string;
  readonly title?: string;
  /** As they are written in the entry, and in the entry's own order. */
  readonly authors: readonly string[];
  readonly editors: readonly string[];
  /** The year as it was written, because a bibliography holds `in press` too. */
  readonly year?: string;
  /** The journal, the proceedings or the book a chapter is in. */
  readonly container?: string;
  readonly volume?: string;
  readonly issue?: string;
  readonly pages?: string;
  readonly publisher?: string;
  readonly place?: string;
  readonly edition?: string;
  readonly issn?: string;
  readonly isbn?: string;
  readonly doi?: string;
  readonly url?: string;
  readonly abstract?: string;
  readonly keywords: readonly string[];
  readonly note?: string;
};
