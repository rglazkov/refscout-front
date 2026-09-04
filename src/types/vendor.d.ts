/**
 * The packages whose types do not reach the entry point we actually import -
 * a browser build named by its path, a bundle that ships none at all. Each is
 * declared here rather than silenced at the call site, so that a wrong call is
 * still a type error.
 */

/**
 * pdf.js in one thread. Importing the worker module registers its message
 * handler on `globalThis`, which is what lets `getDocument` run without
 * spawning a second worker inside the one we are already in.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}

/**
 * mammoth's browser bundle. Its types are written for the package entry, and
 * they describe the same functions.
 */
declare module "mammoth/mammoth.browser.js" {
  import mammoth from "mammoth";
  export default mammoth;
}

/**
 * The DOM implementation the Word conversion runs on. Its own declaration is
 * written for the package's former name, so the current one is declared here.
 */
declare module "@mixmark-io/domino" {
  const domino: {
    createDocument: (html?: string, force?: boolean) => Document;
  };
  export default domino;
}

/** Turndown's GFM rules: tables, strikethrough, task lists. */
declare module "@joplin/turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export const gfm: TurndownService.Plugin;
  export const tables: TurndownService.Plugin;
  export const strikethrough: TurndownService.Plugin;
  export const taskListItems: TurndownService.Plugin;
}

/**
 * The Word assembler's browser bundle. Its types are written for the package
 * entry and describe the same function; naming the browser build is what keeps
 * the bundler from reaching for the Node one, which brings a file system with
 * it. What comes back is whatever that build had to hand - an `ArrayBuffer`, a
 * `Blob` or a `Buffer` - and the caller settles it into bytes.
 */
declare module "@turbodocx/html-to-docx/dist/html-to-docx.browser.esm.js" {
  const HTMLtoDOCX: (
    html: string,
    headerHtml?: string | null,
    options?: Record<string, unknown>,
    footerHtml?: string | null,
  ) => Promise<unknown>;
  export default HTMLtoDOCX;
}

/**
 * citation-js, which ships no types. What is used of it is one link of its
 * input chain - the one that stops at the entries a BibTeX file holds, before
 * they are converted into a shape for producing citations in a style - so that
 * is what is declared, and a call to anything else is a type error rather than
 * `any`.
 */
declare module "@citation-js/core" {
  export const plugins: {
    readonly input: {
      readonly chainLink: (
        input: string,
        options?: { readonly forceType?: string },
      ) => unknown;
    };
  };
}

/** The BibTeX reader for citation-js. Imported for its effect: it registers itself. */
declare module "@citation-js/plugin-bibtex";
