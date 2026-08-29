import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    /*
     * The API origin, which the application reads from the environment. Node
     * has no notion of the page's own origin, so a relative address is not a
     * URL here; naming a stand-shaped one keeps the client under test exactly
     * as it ships, with an absolute address and a cross-origin request.
     */
    env: { NEXT_PUBLIC_API_ORIGIN: "https://api.test.invalid" },
  },
});
