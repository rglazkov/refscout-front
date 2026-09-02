import { publicPath } from "@/lib/public-path";

/**
 * Which server answers is a switch, not a branch in the code.
 *
 * `stand` is the real API named by `NEXT_PUBLIC_API_ORIGIN`; `mock` is the
 * contract's own bodies served from a service worker in this tab. Both go
 * through the same `client.ts`, so no part of the application contains an `if`
 * about the data source, and switching between them needs no edit at all.
 *
 * The comparison is against a value the bundler inlines, so a build made for
 * the stand drops the import below and ships none of the mock.
 */
export const apiSource: "mock" | "stand" =
  process.env.NEXT_PUBLIC_API_SOURCE === "stand" ? "stand" : "mock";

let started: Promise<void> | null = null;

/**
 * Starts the mock and resolves once it is intercepting. It is awaited before
 * the screen is drawn: a request that leaves before the worker is in control
 * would go to the real address, which in a test run is somebody else's server.
 */
export function startApiSource(): Promise<void> {
  if (apiSource === "stand") return Promise.resolve();
  started ??= (async () => {
    const [{ setupWorker }, { handlers }] = await Promise.all([
      import("msw/browser"),
      import("@/test/msw/handlers"),
    ]);
    await setupWorker(...handlers).start({
      quiet: true,
      // Anything this project did not ask for goes to the network as usual;
      // the worker is here to answer our API, not to police the page.
      onUnhandledRequest: "bypass",
      /*
       * Named rather than left to the default, which is the site root. Under a
       * project page the whole site lives one folder down, and a worker looked
       * for at the root is not there - so the mock never starts, and every
       * request the product makes leaves for an address that answers nothing.
       * A script served from that folder may claim it as its scope, and that is
       * the scope the pages under it need.
       */
      serviceWorker: {
        url: publicPath("/mockServiceWorker.js"),
        options: { scope: publicPath("/") },
      },
    });
  })();
  return started;
}
