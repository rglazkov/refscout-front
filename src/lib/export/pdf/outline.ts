import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFNull,
  PDFNumber,
  type PDFDocument,
  type PDFRef,
} from "pdf-lib";

import { margin, page } from "./theme";

/**
 * The index a PDF reader shows down its own side.
 *
 * It is the answer to "where am I" that costs the page nothing: every document
 * and every check in the report becomes a line in the reader's sidebar, and a
 * press on one turns to it. On a report over fifty documents that is the
 * difference between a file somebody scrolls and a file somebody uses.
 *
 * It is assembled by hand because the writer has no notion of an outline. What
 * a reader wants is plain enough - a tree of dictionaries, each naming its
 * parent, its neighbours and the page it points at - and it is written here in
 * those terms rather than pretended to be something else. The titles go in as
 * hex strings: they are somebody's file names, in whatever language the
 * manuscript was written in, and the plain string form of this format cannot
 * hold anything but Latin.
 */
export type Bookmark = {
  readonly title: string;
  /** Which page of the finished file this line turns to, counted from zero. */
  readonly page: number;
  readonly children?: readonly Bookmark[];
};

export function addOutline(document: PDFDocument, items: readonly Bookmark[]): void {
  if (items.length === 0) return;
  const context = document.context;
  const root = context.nextRef();
  const { first, last, count } = writeLevel(document, root, items);
  if (first === undefined || last === undefined) return;

  const outlines = PDFDict.withContext(context);
  outlines.set(PDFName.of("Type"), PDFName.of("Outlines"));
  outlines.set(PDFName.of("First"), first);
  outlines.set(PDFName.of("Last"), last);
  outlines.set(PDFName.of("Count"), PDFNumber.of(count));
  context.assign(root, outlines);

  document.catalog.set(PDFName.of("Outlines"), root);
  /*
   * And the sidebar is asked to be open when the file is opened. A reader who
   * has to find the button first is a reader who never learns the index is
   * there; every viewer honours this, and closing the panel is one press.
   */
  document.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}

/**
 * One level of the tree, written with each line pointing at the one before and
 * the one after it. The count a level reports is its own lines plus every line
 * open underneath them, which is what a reader adds up to decide how far to
 * indent and how much to show.
 */
function writeLevel(
  document: PDFDocument,
  parent: PDFRef,
  items: readonly Bookmark[],
): { first?: PDFRef; last?: PDFRef; count: number } {
  const context = document.context;
  const refs = items.map(() => context.nextRef());
  let count = items.length;

  items.forEach((item, index) => {
    const ref = refs[index];
    if (ref === undefined) return;
    const entry = PDFDict.withContext(context);
    entry.set(PDFName.of("Title"), PDFHexString.fromText(item.title));
    entry.set(PDFName.of("Parent"), parent);

    const previous = refs[index - 1];
    if (previous !== undefined) entry.set(PDFName.of("Prev"), previous);
    const next = refs[index + 1];
    if (next !== undefined) entry.set(PDFName.of("Next"), next);

    entry.set(PDFName.of("Dest"), destination(document, item.page));

    const children = item.children ?? [];
    if (children.length > 0) {
      const below = writeLevel(document, ref, children);
      if (below.first !== undefined && below.last !== undefined) {
        entry.set(PDFName.of("First"), below.first);
        entry.set(PDFName.of("Last"), below.last);
        /*
         * Positive, so the children are shown. A reader takes the sign as the
         * state of the twisty: a report is opened to be looked through, and a
         * tree that arrives closed is a tree nobody opens.
         */
        entry.set(PDFName.of("Count"), PDFNumber.of(below.count));
        count += below.count;
      }
    }

    context.assign(ref, entry);
  });

  const first = refs[0];
  const last = refs.at(-1);
  return {
    ...(first === undefined ? {} : { first }),
    ...(last === undefined ? {} : { last }),
    count,
  };
}

/**
 * Where a line turns to: the top of its page, at the left margin, with the
 * reader's own zoom left alone. `null` for the zoom is what says "do not
 * change it" - a file that resets the magnification on every press is a file
 * that fights the person reading it.
 */
function destination(document: PDFDocument, index: number): PDFArray {
  const sheet = document.getPage(Math.min(index, document.getPageCount() - 1));
  const destination = PDFArray.withContext(document.context);
  destination.push(sheet.ref);
  destination.push(PDFName.of("XYZ"));
  destination.push(PDFNumber.of(margin.left - 12));
  destination.push(PDFNumber.of(page.height));
  destination.push(PDFNull);
  return destination;
}
