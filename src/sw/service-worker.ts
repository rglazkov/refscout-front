/// <reference lib="webworker" />

import { Serwist, type PrecacheEntry } from "serwist";

/**
 * The shell of the application, cached so that a tab opened without a network
 * still opens.
 *
 * The reason is the storage rather than convenience. The only copy of somebody's
 * manuscript is in IndexedDB on this machine, and the only way to reach it is
 * through this application. A tab that shows a blank page on a train is, to the
 * person looking at it, indistinguishable from having lost the document - it is
 * there, and there is no way to get at it. So the shell is cached beside the
 * storage rather than added afterwards.
 *
 * Three rules decide everything below.
 *
 * Requests to the API are not intercepted at all. Nothing here matches them, so
 * nothing here answers them, and they go to the network exactly as they would
 * with no service worker installed. Two reasons, and both are hard. A cached
 * response is a second copy of the analysis of an unpublished manuscript living
 * outside IndexedDB - past the button that deletes saved documents, past the
 * thirty-day sweep, and past the test that says where content may live. And a
 * result served from a cache as though it were fresh is precisely the kind of
 * failure that looks like success.
 *
 * The parsers are not precached. pdf.js with its character maps and standard
 * fonts, mammoth, turndown, unified-latex, citation-js and the assembler that
 * writes a .docx together weigh more than the whole shell, and a first visit
 * must not pay for them. They are cached as they are used instead, and the
 * consequence is stated rather than discovered: a document already parsed is
 * read, corrected and downloaded offline always, and a new file is parsed
 * offline only by a parser this browser has already fetched.
 *
 * A new version does not take over a tab that is open. There is no
 * `skipWaiting` here: the code changes together with the schema of the storage
 * and its migrations, and the tab is holding an open document - swapping the
 * code underneath it means migrating in the middle of somebody's work.
 */

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[];
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // The new worker waits. It is applied on the next full start, or when the
  // person asks for it from the notice the application shows.
  skipWaiting: false,
  clientsClaim: false,
  navigationPreload: false,
  runtimeCaching: [
    {
      /*
       * The parsers and their data, kept once they have actually been fetched.
       * Their names carry content hashes, so a stored answer is either the file
       * or is never asked for again.
       */
      matcher: ({ url, sameOrigin }) =>
        sameOrigin &&
        (url.pathname.includes("/workers/") || url.pathname.includes("/pdfjs/")),
      handler: async ({ request }) => {
        const cache = await caches.open(PARSERS);
        const stored = await cache.match(request);
        if (stored !== undefined) return stored;
        const response = await fetch(request);
        if (response.ok) void cache.put(request, response.clone());
        return response;
      },
    },
  ],
});

/** Where the parsers are kept, apart from the precached shell. */
const PARSERS = "refscout-parsers";

/**
 * The one message the application sends: apply the version that is waiting.
 * It arrives from a press, which is the only thing allowed to replace the code
 * under an open document.
 */
self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if ((event.data as { type?: string } | null)?.type === "apply-update") {
    void self.skipWaiting();
  }
});

serwist.addEventListeners();
