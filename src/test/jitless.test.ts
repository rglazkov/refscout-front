import { config } from "zod";
import { describe, expect, it } from "vitest";

import { zJobStatus } from "@/lib/api/schemas";

/**
 * The validators are interpreted, not compiled.
 *
 * zod builds each object validator with the `Function` constructor by default,
 * and probes for it while the schema is being created. Our `script-src` carries
 * no `unsafe-eval`, so the probe alone raises a violation on the page - which is
 * why the flag is set in a module of its own, imported before the generated
 * schemas everywhere that touches them.
 *
 * The end-to-end policy test would catch a regression here too, but only after
 * a build and only as an unattributed console line. This one names the reason.
 */
describe("no schema is compiled with the Function constructor", () => {
  it("the flag is set by the time a schema exists", () => {
    expect(config().jitless).toBe(true);
  });

  it("and the schemas still parse", () => {
    // A flag that switched validation off instead of switching compilation off
    // would pass the assertion above and check nothing at all.
    expect(() => zJobStatus.parse({ id: "not-a-job" })).toThrow();
  });
});
