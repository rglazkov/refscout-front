import { defineConfig } from "@hey-api/openapi-ts";

/**
 * Wire types and schemas are generated from the contract by a script rather
 * than rewritten by hand. The point is that a mock drifting away from the
 * contract becomes structurally impossible: the mock is not "based on" the
 * contract, it is the contract.
 *
 * Domain types are still written by hand from the screens, and the seam
 * between the two is the mapper signature.
 */
export default defineConfig({
  input: "./contract/refscout-api.yaml",
  output: {
    path: "./src/lib/api/wire",
    // Formatting and linting the generated output is pointless: these files
    // are excluded from prettier and eslint because the contract is what you
    // are supposed to edit.
    postProcess: [],
  },
  plugins: [
    { name: "@hey-api/typescript", enums: "javascript" },
    { name: "zod", exportFromIndex: true },
  ],
});
