import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  /*
   * Each project says which folder it covers, and the folder says who the test
   * is for. `e2e/shared` is the suite both widths run; `e2e/desktop` is what
   * exists on the wide screen alone - the row of header links, which the narrow
   * header replaces with a menu button. A test for a control a width does not
   * have is not written and then excluded: it belongs to the width that has it.
   */
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testDir: "./e2e/shared" },
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
