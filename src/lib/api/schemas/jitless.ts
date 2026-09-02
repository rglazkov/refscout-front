import { config } from "zod";

/**
 * Validators are interpreted rather than compiled.
 *
 * By default zod builds each object validator with the `Function` constructor
 * for speed, and probes for it as the schema is created. Our `script-src`
 * carries no `unsafe-eval` and is not going to: the probe alone raises a
 * `securitypolicyviolation` on the page, and on a browser enforcing the policy
 * the compiled path would not run at all.
 *
 * It is a module of its own, and imported before `wire/zod.gen` everywhere that
 * touches it, because the flag is read while the schemas are being built rather
 * than when one is first used. Setting it in the same file, after the export
 * that pulls the schemas in, would be one line too late.
 */
config({ jitless: true });
