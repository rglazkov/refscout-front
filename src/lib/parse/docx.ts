import { gfm } from "@joplin/turndown-plugin-gfm";
import domino from "@mixmark-io/domino";
import mammoth from "mammoth/mammoth.browser.js";
import TurndownService from "turndown";

import { canonicalise } from "@/lib/docs/canonical";

import { ParseFailure } from "./failure";
import { assess } from "./quality";
import { aborted, type ParseOptions, type Parsed } from "./types";
import { openContainer } from "./zip";

/**
 * Word. A `.docx` becomes markdown and lives in the buffer, in the viewer and
 * in the request as markdown - headings, lists, tables and footnotes kept,
 * pictures dropped.
 *
 * Markdown rather than flat text, and for two reasons that both arrive later:
 * the markup is what the preview renders, and it is what the file is rebuilt
 * from when the document is downloaded as a `.docx` again. Until that exists
 * such a document is downloaded as `.md`, and the label on the button says so.
 *
 * Word is a derived format, so its markdown is folded into NFC once, here -
 * there is no original text of the author's to be faithful to. From that point
 * it is an ordinary document and is never normalised again: the escaping
 * turndown wrote is text like any other, it takes up room in the character
 * count and it is counted by every offset in an answer.
 */

/**
 * The browser build of mammoth, named explicitly. The package's default entry
 * unpacks the container with Node's own file handling, which a bundler shims
 * and a test process does not - so naming the browser build is what makes the
 * corpus run the same code the product does.
 *
 * Two conversions, and the HTML between them never reaches a browser DOM.
 * mammoth writes a string; it is parsed here by domino, a DOM implementation in
 * plain JavaScript, and the tree is handed to turndown as a node. That is not a
 * detail of taste: `DOMParser` does not exist inside a worker, and parsing
 * somebody else's markup with the page's own parser is the thing the security
 * model says never to do.
 */
export async function parseDocx(
  bytes: Uint8Array,
  options: ParseOptions = {},
): Promise<Parsed> {
  if (aborted(options)) throw new ParseFailure("CANCELLED");

  // Unpacking is the expensive half on a large document and the dangerous half
  // on a hostile one, so it is reported as a step of its own.
  options.onProgress?.({ done: 0, total: 3 });
  const { container } = openContainer(bytes);
  options.onProgress?.({ done: 1, total: 3 });

  let html: string;
  try {
    const result = await mammoth.convertToHtml(
      { arrayBuffer: toArrayBuffer(container) },
      {
        /*
         * Pictures are not carried. They cannot be checked, they are the
         * largest thing in the file, and an image inlined as base64 would be
         * counted as tens of thousands of characters of the manuscript. The
         * bytes are never even read: the entries they live in were left in the
         * container we did not open.
         */
        convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
      },
    );
    html = result.value;
  } catch {
    throw new ParseFailure("DOCX_UNREADABLE");
  }
  if (aborted(options)) throw new ParseFailure("CANCELLED");
  options.onProgress?.({ done: 2, total: 3 });

  const markdown = turndown().turndown(domino.createDocument(html).body);
  const extracted = canonicalise(markdown, { format: "docx" });
  options.onProgress?.({ done: 3, total: 3 });

  if (assess(extracted.text).empty) {
    // A container that opened and held nothing. It is the same outcome as a
    // scan - there is no text to check - and it gets the same way out.
    throw new ParseFailure("DOCX_EMPTY");
  }

  return { extracted };
}

/**
 * A converter per document rather than one kept between them: turndown holds
 * the rules it was given, and a service shared across documents is a place for
 * one document's state to reach the next.
 */
function turndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    // Underscores around a word inside an identifier turn the identifier into
    // emphasis when the markdown is read back; asterisks do not.
    emDelimiter: "*",
    strongDelimiter: "**",
  });
  // Tables, strikethrough and task lists. Without them a table becomes a run of
  // paragraphs, and a manuscript loses the part of its structure a reviewer
  // most often points at.
  service.use(gfm);
  // The placeholder mammoth leaves where a picture was. An empty image in the
  // markdown would be a character the person did not write and a position every
  // later offset has to step over.
  service.addRule("droppedImages", { filter: ["img"], replacement: () => "" });
  return service;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
