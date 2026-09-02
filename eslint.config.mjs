import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";
import i18next from "eslint-plugin-i18next";
import a11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

/**
 * A rule written in prose survives until the first deadline. Every constraint
 * from the specification that privacy or the real API integration depends on
 * gets a machine enforcer here, while there is still nothing to violate.
 *
 * The linter catches direct imports; the architecture test
 * (src/test/architecture.test.ts) catches the way around them through a
 * re-export. Both are needed.
 */

/** Accessibility at error level: a warning nobody fixes is not a constraint. */
const a11yRules = Object.fromEntries(
  Object.keys(a11y.flatConfigs.recommended.rules).map((rule) => [rule, "error"]),
);

/**
 * The one substitution inside that set. `label-has-for` is the deprecated form
 * of the same requirement, and it cannot see a control that a component
 * renders: our checkboxes are Radix buttons, so a label that names one by `id`
 * and wraps it still reads as a label with nothing in it. Its replacement,
 * `label-has-associated-control`, is told which components are controls and
 * checks the same thing correctly - the requirement is not relaxed, it is
 * expressed in the rule that can still see it.
 */
a11yRules["jsx-a11y/label-has-for"] = "off";
a11yRules["jsx-a11y/label-has-associated-control"] = [
  "error",
  { controlComponents: ["Checkbox"], depth: 3 },
];

// Inside the application the network lives only here. Build and CI scripts are
// not the application: the header smoke test has to make real requests, which
// is the whole point of a smoke test.
const NETWORK_ALLOWED = ["src/lib/api/**", "src/lib/telemetry/**", "scripts/**"];

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      // Copied verbatim out of pdfjs-dist at build time: vendor code, and not
      // ours to hold to our rules.
      "public/pdfjs/**",
      // Built from src/workers by scripts/build-workers.mjs; the source is linted.
      "public/workers/**",
      // A local scratch copy of the project, made outside the build. It is a
      // second checkout rather than source, and linting it lints everything twice.
      ".audit-head/**",
      // Generated from the contract: the contract is what you edit.
      "src/lib/api/wire/**",
      "**/*.gen.ts",
    ],
  },

  ...nextCoreWebVitals,
  ...nextTypescript,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    // jsx-a11y is already registered by the Next config - only the rule level is set here.
    plugins: { boundaries, i18next },
    settings: {
      "boundaries/include": ["src/**/*.ts", "src/**/*.tsx"],
      "boundaries/elements": [
        { type: "app", pattern: "src/app/**" },
        { type: "feature", pattern: "src/features/*", capture: ["feature"] },
        { type: "ui", pattern: "src/components/ui/**" },
        { type: "shell", pattern: "src/components/**" },
        { type: "lib-api-wire", pattern: "src/lib/api/wire/**" },
        { type: "lib-api", pattern: "src/lib/api/**" },
        { type: "lib", pattern: "src/lib/*", capture: ["lib"] },
        { type: "store", pattern: "src/stores/**" },
        { type: "worker", pattern: "src/workers/**" },
        { type: "test", pattern: "src/test/**" },
      ],
    },
    rules: {
      ...a11yRules,

      // Someone else's JSON shape does not leak into the screens: wire types are
      // visible only inside lib/api.
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: [
                { element: { type: "app" } },
                { element: { type: "feature" } },
                { element: { type: "ui" } },
                { element: { type: "shell" } },
                { element: { type: "lib" } },
                { element: { type: "store" } },
                { element: { type: "worker" } },
                { element: { type: "test" } },
              ],
              disallow: [{ to: { element: { type: "lib-api-wire" } } }],
              message: "api/wire types live only inside lib/api.",
            },
            {
              from: [{ element: { type: "lib", captured: { lib: "telemetry" } } }],
              disallow: [{ to: { element: { type: "lib", captured: { lib: "docs" } } } }],
              message: "Telemetry has no access to the text registry.",
            },
            {
              from: [{ element: { type: "feature", captured: { feature: "intake" } } }],
              disallow: [
                { to: { element: { type: "feature", captured: { feature: "buffer" } } } },
              ],
              message: "Intake and extraction know nothing about the buffer.",
            },
          ],
        },
      ],

      // No text lives in component code: adding a second language must not mean
      // rewriting the components.
      "i18next/no-literal-string": ["error", { mode: "jsx-text-only" }],

      // Markdown from someone else's document does not become an XSS vector.
      "react/no-danger": "error",

      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/api/wire/*", "**/api/wire/*", "@/lib/api/wire/*"],
              message: "api/wire types live only inside lib/api.",
            },
          ],
        },
      ],

      // There is no network outside lib/api and lib/telemetry - that is the
      // product's central promise.
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message: "The network lives only in lib/api and lib/telemetry.",
        },
        {
          name: "XMLHttpRequest",
          message: "The network lives only in lib/api and lib/telemetry.",
        },
        {
          name: "EventSource",
          message: "The network lives only in lib/api and lib/telemetry.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "navigator",
          property: "sendBeacon",
          message: "Sending lives only in lib/api and lib/telemetry.",
        },
        {
          object: "window",
          property: "fetch",
          message: "The network lives only in lib/api and lib/telemetry.",
        },
      ],

      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    files: NETWORK_ALLOWED,
    rules: { "no-restricted-globals": "off", "no-restricted-properties": "off" },
  },

  {
    // Inside lib/api the wire types are an ordinary neighbour.
    files: ["src/lib/api/**"],
    rules: { "no-restricted-imports": "off", "boundaries/dependencies": "off" },
  },

  {
    // The MDX markup table: the content arrives from the page file through
    // children, so rules of the "a heading must have text" kind see nothing
    // here and fire for no reason.
    files: ["src/mdx-components.tsx"],
    rules: {
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/anchor-has-content": "off",
    },
  },

  {
    // The contract test needs both shapes at once - it is precisely about their seam.
    files: ["src/test/**"],
    rules: { "no-restricted-imports": "off", "boundaries/dependencies": "off" },
  },

  {
    // shadcn/ui primitives are generated by the CLI: we do edit them by hand,
    // but we do not rewrite their sr-only literals and stock signatures to fit
    // our rules.
    files: ["src/components/ui/**"],
    rules: {
      "i18next/no-literal-string": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  {
    files: ["**/*.config.{ts,mjs,js}", "scripts/**", "*.config.*"],
    rules: { "i18next/no-literal-string": "off" },
  },

  {
    // Build configs are not part of the TypeScript program, so type-aware rules
    // do not apply to them.
    files: ["**/*.mjs", "**/*.mts", "**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    // .size-limit.js is the size-limit config, and it is loaded as CommonJS.
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  prettier,
);
