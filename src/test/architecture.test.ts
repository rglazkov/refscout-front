import { describe, expect, it } from "vitest";

import {
  buildGraph,
  reachableFrom,
  readSources,
  resolveSpecifier,
} from "./utils/source-graph";

/**
 * The linter catches direct imports; this test catches the way around them
 * through a re-export (M0.4.2). Both are needed: a rule with a single enforcer
 * gets bypassed on the first day bypassing it is convenient.
 */
const files = readSources();
const graph = buildGraph(files);

/** Modules outside the listed directories that refer to the target. */
function importersOutside(target: RegExp, allowed: readonly string[]): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    if (allowed.some((prefix) => file.path.startsWith(prefix))) continue;
    for (const specifier of [...file.imports, ...file.dynamicImports]) {
      const resolved = resolveSpecifier(file.path, specifier) ?? specifier;
      if (target.test(resolved)) offenders.push(`${file.path} -> ${specifier}`);
    }
  }
  return offenders;
}

describe("layer boundaries", () => {
  it("api/wire types never leave lib/api", () => {
    // The contract test is the one exception: it is about the seam between the two shapes.
    expect(importersOutside(/lib\/api\/wire/, ["src/lib/api/", "src/test/"])).toEqual([]);
  });

  it("the text registry is reachable only from intake, the editor, storage, export and the API", () => {
    // lib/export is the fifth, and it earns its place by destination rather
    // than by layer: the file handed back to the person is assembled from the
    // text, and the line numbers in the report are counted over it. It writes a
    // Blob and touches no network, so letting a screen ask it for a download
    // keeps the text out of the screen (M1.10).
    expect(
      importersOutside(/lib\/docs\/registry/, [
        "src/features/intake/",
        "src/features/editor/",
        "src/lib/storage/",
        "src/lib/export/",
        "src/lib/api/",
        "src/lib/docs/",
      ]),
    ).toEqual([]);
  });

  it("telemetry cannot reach the text registry, not even through a re-export", () => {
    const reachable = reachableFrom(graph, "src/lib/telemetry/");
    const leaks = [...reachable].filter((module) => module.startsWith("src/lib/docs"));
    expect(leaks).toEqual([]);
  });

  it("intake and extraction know nothing about the buffer", () => {
    const reachable = reachableFrom(graph, "src/features/intake/");
    const leaks = [...reachable].filter((module) =>
      module.startsWith("src/features/buffer"),
    );
    expect(leaks).toEqual([]);
  });

  it("the network lives only in lib/api and lib/telemetry", () => {
    const network =
      /\b(fetch\(|new XMLHttpRequest|navigator\.sendBeacon|new EventSource)/;
    const offenders = files
      .filter(
        (file) =>
          !file.path.startsWith("src/lib/api/") &&
          !file.path.startsWith("src/lib/telemetry/") &&
          !file.path.startsWith("src/test/") &&
          network.test(file.text),
      )
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

describe("dynamic loading of features (M0.9.4)", () => {
  const outsideFeatures = files.filter((file) => !file.path.startsWith("src/features/"));

  it("features is never pulled in by a static import", () => {
    const offenders: string[] = [];
    for (const file of outsideFeatures) {
      if (file.path.startsWith("src/test/")) continue;
      for (const specifier of file.imports) {
        const resolved = resolveSpecifier(file.path, specifier) ?? specifier;
        if (resolved.startsWith("src/features/"))
          offenders.push(`${file.path} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every features mount point asks for ssr: false", () => {
    const offenders = outsideFeatures
      .filter((file) =>
        file.dynamicImports.some((specifier) => {
          const resolved = resolveSpecifier(file.path, specifier) ?? specifier;
          return resolved.startsWith("src/features/");
        }),
      )
      .filter((file) => !/ssr:\s*false/.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

describe("one tree, every language (§15)", () => {
  it("every page lives under [locale]", () => {
    // The default language is served from `/` too, but not by a second tree:
    // the root is a post-build copy of its folder. A page added outside
    // [locale] would exist in English alone, while hreflang and the sitemap
    // went on advertising it in every language.
    const offenders = files
      .filter((file) => /^src\/app\/.*\/page\.tsx$/.test(file.path))
      .filter((file) => !file.path.startsWith("src/app/[locale]/"))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("a page file delegates rather than holding markup", () => {
    // What a page looks like belongs in components/pages/, where it is written
    // once. A route file that renders markup is a page that starts collecting
    // decisions the other languages do not get.
    const pages = files.filter((file) =>
      /^src\/app\/\[locale\]\/.*page\.tsx$/.test(file.path),
    );
    expect(pages.length).toBeGreaterThan(0);

    const offenders = pages
      .filter((file) => (file.text.match(/<[a-z][a-z0-9]*[\s/>]/g) ?? []).length > 0)
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

describe("static export (M0.1.1)", () => {
  it("every page declares its locale statically", () => {
    // Without setRequestLocale next-intl asks the request for the locale,
    // reading the request turns the page into a server page, and a static
    // export has no server pages. The build still succeeds and the problem only
    // surfaces in dev, which is why this rule needs a test rather than memory.
    const rendered = files.filter((file) =>
      /^src\/app\/(.*\/)?(page|layout|global-not-found)\.tsx$/.test(file.path),
    );
    expect(rendered.length).toBeGreaterThan(0);

    const offenders = rendered
      .filter((file) => !file.text.includes("setRequestLocale("))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
