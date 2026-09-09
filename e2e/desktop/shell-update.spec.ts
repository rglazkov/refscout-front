import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { READING_MS } from "../support/reading";

/**
 * A new build does not replace the code under an open tab.
 *
 * The reason is not tidiness. The code changes together with the schema of the
 * storage and its migrations, and a tab may be holding an open document, so a
 * swap underneath it would be a migration in the middle of somebody's work. It
 * is also what keeps the build named in every report we send the build that is
 * actually running.
 *
 * It lives in one project's folder because the check edits the built worker on
 * disk, and two projects doing that side by side would be measuring each other
 * rather than the rule. Nothing about it is specific to a wide screen; what it
 * needs is to be the only run touching that file.
 */
const SHELL = "/sw.js";

test("a new build waits instead of taking over", async ({ page, context }) => {
  /*
   * Automatic reports off for this context, and it is the scope that needs it
   * rather than the privacy of a test. A batch falling due starts the mock to
   * find out which server to send to, the mock registers its own worker at this
   * same scope, and a scope belongs to one worker - so the shell under test
   * would be replaced by something the test never asked for. Which is the same
   * fact the product acts on by registering the shell only where the mock is
   * absent.
   */
  await context.addInitScript(() => localStorage.setItem("telemetry", "off"));

  await page.goto("/privacy/");
  await page.evaluate(async (script) => {
    await navigator.serviceWorker.register(script, {
      scope: "/",
      updateViaCache: "none",
    });
    await navigator.serviceWorker.ready;
  }, SHELL);

  // Something to look for afterwards: if the tab were reloaded, it would be
  // gone. The whole rule is about not doing that under an open document.
  await page.evaluate(() => {
    (window as unknown as { openSince: number }).openSince = Date.now();
  });

  const shell = join("out", "sw.js");
  const original = readFileSync(shell, "utf8");
  try {
    // A different build at the same address. The change is a comment, because
    // the question is not whether the new code works but whether it is allowed
    // to take over. The file is put back afterwards.
    writeFileSync(shell, `${original}\n// a newer build\n`, "utf8");

    // Installing it is the whole shell being cached again, so the answer is
    // waited for rather than read the instant `update()` returns.
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration("/");
            await registration?.update();
            return registration?.waiting?.state ?? null;
          }),
        { timeout: READING_MS },
      )
      .toBe("installed");

    // And the tab it is waiting behind was never reloaded: the mark put on the
    // window before any of this is still there.
    const stillOpen = await page.evaluate(
      () => (window as unknown as { openSince?: number }).openSince !== undefined,
    );
    expect(stillOpen).toBe(true);
    expect(page.url()).toContain("/privacy/");
  } finally {
    writeFileSync(shell, original, "utf8");
  }
});
