import { expect, test, type Page } from "@playwright/test";

import { READING_MS } from "../support/reading";
import { keepTheMockOffTheScope } from "../support/scope";

/**
 * The tab reloaded with no network at all, which is the whole question an
 * offline shell exists to answer.
 *
 * A test that only checks the first visit does not see it. The single copy of
 * somebody's manuscript is in this browser and the only way to reach it is
 * through this application, so what matters is not that the files were fetched
 * once but that the second opening works with nothing to fetch them from - on a
 * train, in a plane, on a campus network that answers sometimes.
 *
 * It runs in one engine because only one can be asked through this driver.
 * Chromium driven over the debugging protocol never delivers a navigation to a
 * service worker: the request does not reach it and the page never commits, so
 * the reload that is the point of the exercise hangs rather than failing. That
 * is the driver rather than the browser - real Chrome, launched by hand with no
 * driver attached, serves the same navigations out of the cache with nothing
 * crossing the network - but a hang cannot be asserted against, so the question
 * is put to the engine that answers it.
 *
 * The mock is the other reason this is one file rather than a line in another.
 * A scope belongs to one service worker, and in a build wired to the mock the
 * contract's own bodies come from a worker at that same scope, registered again
 * on every page. That is why the product registers the shell only where the
 * mock is absent, and why the order below is what it is: the document is
 * brought in first, while the mock is still answering, and only then is the
 * mock kept off the scope for good - by that point nothing here needs a server,
 * and the tab that goes offline is in the charge of the shell rather than of
 * whichever script registered last.
 */
const MANUSCRIPT = `\\documentclass{article}
\\begin{document}
Dense retrieval is usually left to a frozen encoder.
\\end{document}
`;

const SHELL = "/sw.js";

/** Takes the scope for the shell and waits for it to have cached the shell. */
async function installShell(page: Page): Promise<void> {
  await page.evaluate(async (script) => {
    /*
     * The mock is holding this scope, and one scope is one worker - so it is
     * taken off before the shell is put on, rather than the shell being
     * registered over it. Registering over it would give the shell a turn
     * behind the mock instead of a registration of its own, and a worker that
     * is only waiting goes away with the registration it waits in: the mock
     * drops its own the moment its last client closes, which is what a reload
     * is, and the tab would come back with nothing in charge of it at all.
     */
    const held = await navigator.serviceWorker.getRegistration("/");
    if (held !== undefined) await held.unregister();
    await navigator.serviceWorker.register(script, { scope: "/" });
    await navigator.serviceWorker.ready;
  }, SHELL);

  // The scope is the shell's before anything is asked of it, and it is named
  // rather than counted: what the rest of this reads - a cache filling, a tab
  // coming back with a worker in charge of it - would be true of either script.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration("/");
          return registration?.active?.scriptURL ?? null;
        }),
      { timeout: READING_MS },
    )
    .toContain(SHELL);

  // Precaching runs in the background after the load event, which is the point
  // - a first visit pays for offline neither in time nor in traffic - so this
  // waits for the same thing a person coming back later relies on.
  await expect
    .poll(
      async () =>
        await page.evaluate(async () => {
          const names = await caches.keys();
          let held = 0;
          for (const name of names) {
            held += (await (await caches.open(name)).keys()).length;
          }
          return held;
        }),
      { timeout: READING_MS },
    )
    .toBeGreaterThan(100);

  /*
   * One navigation with the network still on, because a freshly installed
   * worker does not take over a page that was already open - `clients.claim` is
   * deliberately not used, since claiming would put a new version in charge of
   * a tab holding an open document. This reload is a person's second visit.
   */
  await page.reload({ waitUntil: "load" });
  await expect
    .poll(
      () =>
        page
          .evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)
          // The reload can still be settling when the first question is asked,
          // and a context that went away under it is not an answer.
          .catch(() => null),
      { timeout: READING_MS },
    )
    .toContain(SHELL);
}

test("a tab opened with no network has the application and the manuscript", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles({
    name: "paper.tex",
    mimeType: "text/plain",
    buffer: Buffer.from(MANUSCRIPT, "utf8"),
  });
  await expect(page.getByTestId("document-card")).toContainText("characters", {
    timeout: READING_MS,
  });

  await keepTheMockOffTheScope(context);
  await installShell(page);
  await expect(page.getByTestId("document-card")).toHaveCount(1, {
    timeout: READING_MS,
  });

  await context.setOffline(true);
  await page.reload();

  // The application itself: served out of the cache with nothing fetched.
  const fetched = await page.evaluate(() => {
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    return navigation.transferSize;
  });
  expect(fetched).toBe(0);

  // And the manuscript, read back out of the storage in this browser.
  await expect(page.getByTestId("document-card")).toHaveCount(1, {
    timeout: READING_MS,
  });
  await expect(page.getByTestId("document-card")).toContainText("characters");

  // It still opens, and it still takes a correction - none of that ever needed
  // a server, which is why the offline shell costs so little: it does not add
  // an offline mode, it stops taking away what already worked in the browser.
  await page.getByRole("button", { name: "paper.tex", exact: true }).click();
  await expect(page.getByTestId("editor")).toContainText("Dense retrieval", {
    timeout: READING_MS,
  });
  await page.getByTestId("editor").getByRole("textbox").click();
  await page.keyboard.type("Corrected with no network. ");
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "paper.tex", exact: true }).click();
  await expect(page.getByTestId("editor")).toContainText("Corrected with no network.");
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();

  /*
   * The three things that genuinely need a server say so, and running a check
   * is the first of them. It is not `disabled`: it keeps its place in the tab
   * order, is marked `aria-disabled`, and names the reason where the person
   * pressed. A queue that sent the manuscript once the network came back would
   * be worse than the refusal - it would mean the text leaves the browser at
   * some moment other than a press of the button.
   */
  await expect(page.getByTestId("offline-banner")).toBeVisible();
  const run = page.getByRole("button", { name: /Run the check/i });
  await expect(run).toHaveAttribute("aria-disabled", "true");
  await run.click({ force: true });
  await expect(page.getByText(/needs the network/i)).toBeVisible();

  await context.setOffline(false);
});
