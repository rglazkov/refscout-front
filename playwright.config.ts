import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  /*
   * Longer than a test's own longest wait, which is a minute: several of them
   * wait that long for a document to be read, because the second engine takes
   * the fallback path for workers and a dissertation-shaped fixture is slow on
   * it. At the default of thirty seconds the test was killed before its own
   * wait could elapse - so the wait was decoration, and the failure it produced
   * named the assertion rather than the slowness. Reached only when something
   * has genuinely stalled; a passing run is nowhere near it.
   */
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  /*
   * The folder says who the test is for, and each project runs its own folder
   * and the shared one. `e2e/shared` is what both widths run; `e2e/desktop` is
   * what exists on the wide screen alone - the row of header links the narrow
   * header replaces with a menu button, and hover, which a touch screen does
   * not have; `e2e/mobile` is what the narrow screen has of its own, which is
   * mostly width given back to the content.
   *
   * A test for something a width does not have is not written for both and then
   * excluded: it is put in the folder of the width that has it.
   */
  projects: [
    /*
     * Anchored on `e2e/` and written as expressions rather than as folder
     * globs. A glob is matched against the absolute path, and this checkout
     * lives under a folder named Desktop - so a glob naming the desktop folder
     * matched every file there is, and the narrow suite silently ran nothing.
     */
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /e2e[\\/]mobile[\\/]/,
    },
    /*
     * The second engine, and it earns its place: the one defect this milestone
     * shipped that no test caught was a worker that would not start in Firefox,
     * and it failed in silence. Playwright ships a patched Firefox that will not
     * run a module worker at all, so what runs here is the fallback path - which
     * is exactly the path a browser like that takes in the product.
     */
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      /*
       * Four files, and all four are about the engine. The first asks whether a
       * worker starts here and reads every kind of document. The second asks
       * whether the two panes of a comparison stay level, which rests on how
       * the browser measures text - the one part of the layout that is a
       * different answer in a different engine. The third is the reporting of
       * problems, and it belongs here for the same reason as the first: what it
       * rests on - a batch delivered while the tab is closing, a queue in
       * IndexedDB, a key combination read by its code - differs between engines,
       * and every one of its failures is silent by design. The fourth is the
       * preview, where the editor is taken off the screen while the drawn page
       * stands in front of it and put back afterwards: whether it measures
       * itself again on the way back is the browser's answer and not ours, and
       * an editor that came back mismeasured would be a blank field where a
       * manuscript was. What the rest of the suite asks - contrast, wording, the
       * shape of the flow - does not turn on the engine, and running it twice
       * would buy re-tuned assertions rather than confidence.
       */
      testMatch: /(worker-start|diff-alignment|report|preview)\.spec\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testIgnore: /e2e[\\/]desktop[\\/]/,
    },
  ],
  webServer: {
    // The headers come from the post-build step: without them the CSP test
    // would be asserting against nothing.
    command: "node scripts/serve-out.mjs",
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
