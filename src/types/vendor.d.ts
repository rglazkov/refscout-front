/**
 * Two packages that ship no types of their own. Both are named here rather than
 * silenced at the call site, so that a wrong call is still a type error.
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
