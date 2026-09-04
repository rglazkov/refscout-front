import HTMLtoDOCX from "@turbodocx/html-to-docx/dist/html-to-docx.browser.esm.js";
import MarkdownIt from "markdown-it";

import { ParseFailure } from "./failure";

/**
 * The way back out of the one format that is a container rather than text.
 *
 * A Word file arrived here as markdown - mammoth and turndown made it one when
 * it was read - and it leaves as a Word file again, which is what the person
 * brought and what they expect back. Everything else in the product is already
 * text and is written out as it stands: a `.tex` printed back through a library
 * would come back syntactically correct and reformatted, and its author would
 * see a thousand changed lines in the first `git diff`.
 *
 * This lives beside the parsers because it is the same folder's other
 * direction, it runs in the same worker, and the libraries it needs are as
 * heavy as the ones that read the file. Nobody who brought a `.bib` downloads
 * any of it.
 */

/**
 * The project's markdown parser, and there is not a second one anywhere. Here
 * it is used for the half of it that has waited until now: `render()`, which
 * turns the tokens into the HTML the Word assembler reads.
 */
function markdown(): InstanceType<typeof MarkdownIt> {
  const renderer = new MarkdownIt({
    /*
     * Raw HTML in the source is written out as the characters it is, not as
     * markup. Two reasons, and either alone would be enough: the markdown here
     * came out of somebody's manuscript, and a `<script>` in a footnote must
     * not become a live tag on the way into a file that other people open; and
     * a person who typed `<sup>` in their text meant those five characters.
     */
    html: false,
    linkify: false,
    typographer: false,
  });

  /*
   * Pictures are dropped on the way in and stay dropped on the way out. There
   * is nothing behind them: the entries they lived in were left unread inside
   * the Word container, so an `<img>` here would be an address the assembler
   * would go to the network to fetch. What is written instead is the
   * description the author gave the picture, which is the part that was text.
   */
  renderer.renderer.rules.image = (tokens, index) =>
    escapeHtml(tokens[index]?.content ?? "");

  return renderer;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Markdown into the bytes of a `.docx`.
 *
 * The HTML in the middle exists for the length of this function and reaches no
 * DOM at any point: it is a string handed straight to the assembler, so the
 * rule that a preview is built from tokens rather than from HTML is untouched,
 * and no path opens from somebody else's text to markup on a page.
 */
export async function assembleDocx(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const html = markdown().render(text);
  let built: unknown;
  try {
    // No document options are given, and that is the decision rather than an
    // omission: everything they set - margins, the page size, a font - is the
    // look of a document we are not the author of, and the assembler's own
    // defaults are the ordinary Word page a person expects to open.
    built = await HTMLtoDOCX(`<!DOCTYPE html><html><body>${html}</body></html>`, null);
  } catch {
    throw new ParseFailure("DOCX_BUILD_FAILED");
  }
  return toBytes(built);
}

/**
 * The assembler hands back whichever container it decided the environment
 * offers, and it decides by looking at the globals: a `Blob` in a browser, and
 * its own bundled `Buffer` wherever one is defined - which is a test process,
 * and there the object is a list of byte values rather than a typed array at
 * all. What crosses back out of the worker is bytes, so every shape ends here
 * and only one of them leaves.
 *
 * Copied rather than handed on as it stands. A typed array can be a view onto
 * part of a larger buffer, or onto memory shared between threads, and neither
 * goes into a Blob as itself - so the bytes are settled into a buffer of their
 * own once, at the end of the work rather than in the middle of it.
 */
async function toBytes(built: unknown): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof Blob !== "undefined" && built instanceof Blob) {
    return new Uint8Array(await built.arrayBuffer());
  }
  if (built instanceof ArrayBuffer) return new Uint8Array(built);
  if (ArrayBuffer.isView(built)) {
    return new Uint8Array(
      built.buffer.slice(built.byteOffset, built.byteOffset + built.byteLength),
    ) as Uint8Array<ArrayBuffer>;
  }
  if (isByteList(built)) return Uint8Array.from(built);
  throw new ParseFailure("DOCX_BUILD_FAILED");
}

function isByteList(value: unknown): value is ArrayLike<number> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { length?: unknown }).length === "number"
  );
}
