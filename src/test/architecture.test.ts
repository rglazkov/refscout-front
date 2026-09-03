import { describe, expect, it } from "vitest";

import {
  buildGraph,
  packagesUpFront,
  reachableFrom,
  readSources,
  resolveSpecifier,
} from "./utils/source-graph";

/**
 * The linter catches direct imports; this test catches the way around them
 * through a re-export. Both are needed: a rule with a single enforcer gets
 * bypassed on the first day bypassing it is convenient.
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
    // keeps the text out of the screen.
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

describe("a result once given is not taken back", () => {
  /**
   * The screen of findings knows nothing about access. Days of access that ran
   * out in the middle of a run leave every card that had already arrived
   * readable and exportable, and the way that is guaranteed is that there is no
   * path from the results to the answer about entitlements at all - so no
   * condition on it can be added by accident, and none can be added on purpose
   * without this failing first.
   */
  it("nothing on the results screen names the entitlements", () => {
    const offenders = files
      .filter((file) => file.path.startsWith("src/features/results/"))
      .filter((file) => /entitlement/i.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

describe("what the client bundle must not contain", () => {
  /**
   * The password flows and the administration panel. Both exist on the server,
   * and neither may exist here even behind a flag that is switched off: code in
   * the bundle names the addresses it calls, and an address named in public
   * JavaScript is an address anybody can start knocking on. Sign-in goes
   * through the providers, a reset arrives as a link in an email to a server
   * address, and the administration panel is a separate subdomain and a
   * separate build.
   */
  it("has neither the password flows nor the administration panel in it", () => {
    const forbidden = /auth\/password\/|admin-modal|\/admin/;
    const offenders = files
      // The generated wire module is exempt because it is the contract written
      // out: it declares a type per operation, including the ones only the
      // server ever performs, and a type is erased before anything is shipped.
      // What matters is that nothing hand-written calls those addresses.
      .filter(
        (file) =>
          !file.path.startsWith("src/test/") &&
          !file.path.startsWith("src/lib/api/wire/"),
      )
      .filter((file) => forbidden.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

describe("connecting a module is its codes and one renderer", () => {
  /**
   * The claim the whole results screen rests on: four modules answer in four
   * shapes and the interface works with one. A module that had to be named in
   * the shared code would mean the next one has to be named there too, and the
   * screen would slowly become four screens sharing a file.
   *
   * The place a module may be named is its own renderer of details, and the
   * card's decision to open Cite over the page instead of in the grid - which
   * is not about the shape of Cite's findings but about the shape of its
   * screen, a claim with its candidates being a screenful.
   */
  it("no module is named in the code shared by all of them", () => {
    const shared = files.filter(
      (file) =>
        (file.path.startsWith("src/features/results/") ||
          file.path.startsWith("src/lib/normalize/")) &&
        !file.path.startsWith("src/features/results/details/") &&
        !file.path.startsWith("src/features/results/cite-overlay"),
    );
    const named = /"(bibcheck|glossary|presubmit)"/;
    const offenders = shared
      .filter((file) => named.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});

describe("dynamic loading of features", () => {
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

  /**
   * A parser is tens of kilobytes of generated table, and it is of no use until
   * a document of that kind is open. Imported statically it would join the
   * chunk the editor lives in, and every person who opened any text would carry
   * the tables for all three formats.
   */
  it("a language parser is only ever reached through import()", () => {
    const parsers = [
      "@codemirror/lang-markdown",
      "@codemirror/legacy-modes",
      "codemirror-lang-bib",
    ];
    const offenders: string[] = [];
    for (const file of files) {
      if (file.path.startsWith("src/test/")) continue;
      for (const specifier of file.imports) {
        if (parsers.some((parser) => specifier.startsWith(parser))) {
          offenders.push(`${file.path} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * `markdown()` from the language package carries a whole HTML parser with it,
   * and JavaScript and CSS behind that, for the markup a Markdown file may
   * embed - a hundred kilobytes to colour a `<br>` in somebody's manuscript.
   * `markdownLanguage` is the same GFM grammar without them.
   */
  it("the HTML, JavaScript and CSS parsers are reached by nothing", () => {
    const unwanted = [
      "@codemirror/lang-html",
      "@codemirror/lang-javascript",
      "@codemirror/lang-css",
    ];
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of [...file.imports, ...file.dynamicImports]) {
        if (unwanted.some((parser) => specifier.startsWith(parser))) {
          offenders.push(`${file.path} -> ${specifier}`);
        }
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

describe("one tree, every language", () => {
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

describe("static export", () => {
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

describe("the two modes of the working screen", () => {
  /**
   * A search result and a Cite candidate are the same record - the contract
   * defines it once and both answers carry it - so there is one card, and both
   * screens reach for it. Two cards would differ by the second edit, and a
   * record would then be read one way beside a claim and another way in a list.
   */
  it("one card draws a bibliographic record on both screens", () => {
    const card = "src/features/records/record-card";
    for (const screen of [
      "src/features/results/cite-overlay.tsx",
      "src/features/scout/scout-screen.tsx",
    ]) {
      const file = files.find((candidate) => candidate.path === screen);
      expect(file).toBeDefined();
      const reached = (file?.imports ?? []).map(
        (specifier) => resolveSpecifier(screen, specifier) ?? specifier,
      );
      expect(reached).toContain(card);
    }
  });

  /**
   * Cite shows the result of a check. A field for a domain, a "find citations"
   * or a "search anyway" in it would make it the beginning of a piece of work
   * instead - and there is a screen for beginning that work.
   */
  it("nothing in the Cite overlay starts a search", () => {
    const overlay = files.find(
      (file) => file.path === "src/features/results/cite-overlay.tsx",
    );
    expect(overlay).toBeDefined();
    expect(overlay?.text).not.toMatch(/scoutSearch|scout-screen/);
  });

  /**
   * There is one way into each mode, and it is the pair of buttons beside
   * "paste text" while the buffer is empty. A second entry from a card, a
   * plan, a stage of the progress or a finding is what turns two tools into
   * two more things to notice on every screen.
   */
  it("the modes are entered from one place", () => {
    const offenders = files
      .filter((file) => file.path.startsWith("src/features/"))
      .filter((file) => !file.path.startsWith("src/features/buffer/workspace"))
      .filter((file) => /setMode\(/.test(file.text))
      // A mode's own way back out of itself is that one call, and it is the
      // way back rather than a way in.
      .filter(
        (file) =>
          !file.path.startsWith("src/features/scout/") &&
          !file.path.startsWith("src/features/diff/"),
      )
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  /**
   * The comparison has nothing to send, so it cannot reach what sends. What it
   * does reach is the intake every text in the product goes through, and with
   * it the counters a bad parse reports - which carry numbers and never a
   * character of anybody's text.
   */
  it("comparing two versions cannot reach the API layer", () => {
    const reachable = reachableFrom(graph, "src/features/diff/");
    const leaks = [...reachable].filter((module) => module.startsWith("src/lib/api"));
    expect(leaks).toEqual([]);
  });
});

describe("what a marketing page costs to open", () => {
  /**
   * The addresses a person arrives on before they have brought anything: the
   * start page, the list of checks, a check's own page and the pricing card.
   * The layout is one of them because every page is served inside it.
   */
  const MARKETING = [
    "src/app/[locale]/layout.tsx",
    "src/app/[locale]/page.tsx",
    "src/app/[locale]/features/page.tsx",
    "src/app/[locale]/features/[feature]/page.tsx",
    "src/app/[locale]/pricing/page.tsx",
  ];

  /**
   * The libraries that exist to read or to write a document, and which are of
   * no use at all until somebody has brought one. Between them they are most of
   * what the product weighs - a PDF engine, an editor, the readers and writers
   * of the formats - and none of it may arrive with a page that is text.
   *
   * The recorded sizes in `budget.json` say what a page costs; this says why.
   * A budget notices growth after it has happened and only when it is large
   * enough to show, whereas this fails on the import that caused it and names
   * the chain that brought it in.
   */
  const ON_DEMAND_ONLY = [
    "pdfjs-dist",
    "mammoth",
    "turndown",
    "@joplin/turndown-plugin-gfm",
    "@mixmark-io/domino",
    "fflate",
    "@codemirror/",
    "codemirror-lang-bib",
    /*
     * And the query library, which belongs to the screens that hold the
     * server's state. A page of text asks the server nothing until somebody
     * presses something, so the one control that does press reaches for it
     * behind an import() of its own.
     */
    "@tanstack/react-query",
  ];

  it("no page a visitor lands on pulls in a parser or the editor", () => {
    const packages = packagesUpFront(files, MARKETING);
    // A renamed entry file would leave the walk with nothing to follow, and the
    // check would pass by reaching no package at all.
    expect([...packages.keys()]).toContain("next-intl/server");

    const offenders = [...packages]
      .filter(([name]) => ON_DEMAND_ONLY.some((library) => name.startsWith(library)))
      .map(([, chain]) => chain);
    expect(offenders).toEqual([]);
  });
});

describe("one dictionary, one language", () => {
  const DICTIONARY = /messages\/[^/]+\.json$/;

  /**
   * A dictionary reached by a static import is a dictionary in the bundle, and
   * with a second language every visitor would carry the words of a language
   * they are not reading. It is loaded through `import()` with the language in
   * the path instead, so the bundler makes one chunk per language.
   */
  it("no language's words are imported statically", () => {
    // The tests are not the bundle: a case that renders a screen hands it the
    // words directly rather than letting it fetch them.
    const offenders: string[] = [];
    for (const file of files) {
      if (file.path.startsWith("src/test/")) continue;
      for (const specifier of file.imports) {
        if (DICTIONARY.test(specifier)) offenders.push(`${file.path} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every dictionary is asked for by the language being read", () => {
    // A literal in the path would be one language pinned into the code, which
    // is the same defect wearing an import() around it.
    const literal = files
      .flatMap((file) =>
        file.dynamicImports
          .filter((specifier) => DICTIONARY.test(specifier))
          .map((specifier) => `${file.path} -> ${specifier}`),
      )
      .filter((entry) => !entry.includes("${"));
    expect(literal).toEqual([]);

    // And the two places that do ask, so that a third way in cannot appear
    // unnoticed: the request configuration used at build time, and the fetch
    // the browser makes when a screen needs the rest of the words.
    const asking = files
      .filter((file) => !file.path.startsWith("src/test/"))
      .filter((file) => /messages\/\$\{/.test(file.text))
      .map((file) => file.path)
      .sort();
    expect(asking).toEqual(["src/lib/i18n/messages.ts", "src/lib/i18n/request.ts"]);
  });
});
