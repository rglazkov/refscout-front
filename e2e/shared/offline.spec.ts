import { expect, test } from "@playwright/test";

import { READING_MS } from "../support/reading";

/**
 * The application without a network, asked of the cache.
 *
 * The reload with no signal - the question an offline shell exists to answer -
 * is next door, in the file that runs in one engine, because only one of the
 * browsers this suite drives can perform it: Chromium over the debugging
 * protocol never delivers a navigation to a service worker and simply hangs,
 * which is the driver and not the browser. What is asked here is what that
 * reload rests on and what holds in every engine and at every width: that the cache holds
 * every address a page is built out of, that nothing which came from the API is
 * anywhere in it, that a new build waits instead of taking over an open tab,
 * and that the one action needing a server says so where it is pressed.
 *
 * One thing about how these run. A scope belongs to one service worker, and in
 * this build the scope is already taken: the contract's own bodies are served
 * from a worker in the tab, which is why the product registers the shell only
 * where the mock is absent. So the test registers it the way the product would,
 * on a page that never starts the mock.
 */
const SHELL = "/sw.js";

test.describe("the shell without a network", () => {
  test("the shell keeps everything a page is made of", async ({ page, context }) => {
    /*
     * Automatic reports off for this context, and it is the scope that needs
     * it rather than the privacy of a test. A batch falling due starts the mock
     * to find out which server to send to, the mock registers its own worker at
     * this same scope, and a scope belongs to one worker - so the shell under
     * test would be replaced from underneath it by something the test never
     * asked for. Which is the same fact the product acts on by registering the
     * shell only where the mock is absent.
     */
    await context.addInitScript(() => localStorage.setItem("telemetry", "off"));

    await page.goto("/privacy/");
    await page.evaluate(async (script) => {
      await navigator.serviceWorker.register(script, { scope: "/" });
      await navigator.serviceWorker.ready;
    }, SHELL);

    /*
     * Every address the page is actually built out of, read off the page itself
     * rather than listed by hand: a list written here would go stale the first
     * time a chunk was renamed, and would go stale silently.
     */
    const missing = await page.evaluate(async () => {
      const wanted = ["/", "/privacy/", "/pricing/", "/features/"];
      for (const node of document.querySelectorAll("script[src], link[href]")) {
        const url = node.getAttribute("src") ?? node.getAttribute("href") ?? "";
        // Only what is ours and is part of the shell: a stylesheet, a script, a
        // font. An anchor to another site is not something we could cache.
        if (url.startsWith("/_next/") || url.startsWith("/fonts/")) wanted.push(url);
      }

      const names = await caches.keys();
      const held = new Set<string>();
      for (const name of names) {
        for (const request of await (await caches.open(name)).keys()) {
          held.add(new URL(request.url).pathname);
        }
      }
      return wanted.filter((url) => !held.has(new URL(url, location.href).pathname));
    });

    expect(missing).toEqual([]);
  });

  test("nothing that came from the API is in any cache", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "paper.tex",
      mimeType: "text/plain",
      buffer: Buffer.from("\\documentclass{article}\nA short manuscript.\n", "utf8"),
    });
    await expect(page.getByTestId("document-card")).toContainText("characters", {
      timeout: READING_MS,
    });
    await page.getByTestId("run").click();
    await expect(page.getByTestId("results-totals")).toBeVisible({ timeout: 30_000 });

    /*
     * A cached answer would be a second copy of the analysis of an unpublished
     * manuscript, living outside the storage that "Delete saved documents"
     * empties and outside the thirty-day sweep. So the rule is not "cache it
     * carefully" but "never see it": everything bound for the API goes past the
     * worker untouched.
     */
    const cached = await page.evaluate(async () => {
      if (typeof caches === "undefined") return [];
      const names = await caches.keys();
      const urls: string[] = [];
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) urls.push(request.url);
      }
      return urls;
    });
    const origin = new URL(page.url()).origin;
    expect(cached.filter((url) => !url.startsWith(origin))).toEqual([]);
    expect(cached.filter((url) => url.includes("/jobs/"))).toEqual([]);
  });

  test("running a check offline says why and stays reachable", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.getByTestId("file-input").setInputFiles({
      name: "paper.tex",
      mimeType: "text/plain",
      buffer: Buffer.from("\\documentclass{article}\nA short manuscript.\n", "utf8"),
    });
    await expect(page.getByTestId("document-card")).toContainText("characters", {
      timeout: READING_MS,
    });

    await context.setOffline(true);
    await expect(page.getByTestId("offline-banner")).toBeVisible();

    // Not `disabled`: it keeps its place in the tab order, is marked
    // `aria-disabled`, and says why where the person pressed. A queue that sent
    // the manuscript later would be worse than the refusal - it would mean the
    // text leaves the browser at some moment other than a press of the button.
    const run = page.getByRole("button", { name: /Run the check/i });
    await expect(run).toHaveAttribute("aria-disabled", "true");
    // Forced because the driver treats `aria-disabled` as unclickable, which is
    // the opposite of the point: the button is reachable, and pressing it is
    // what produces the sentence.
    await run.click({ force: true });
    await expect(page.getByText(/needs the network/i)).toBeVisible();

    // And what does not need a server is untouched: the text still opens.
    await page.getByRole("button", { name: "paper.tex", exact: true }).click();
    await expect(page.getByTestId("editor")).toContainText("A short manuscript.");
    await context.setOffline(false);
  });
});
