import { describe, expect, it } from "vitest";

import {
  buildGraph,
  reachableFrom,
  readSources,
  resolveSpecifier,
} from "./utils/source-graph";

/**
 * The rules that make "nothing is parsed outside a worker" true rather than
 * intended.
 *
 * All three below are the kind of rule that survives exactly as long as nobody
 * is in a hurry, so each has an enforcer. The linter catches a direct import;
 * this catches the way round it through a re-export, and it also catches the
 * thing a linter cannot see - what is reachable from a worker's entry point
 * once every hop is followed.
 */
// A declaration file names a package to describe its types and pulls nothing
// into a bundle, so it is not an importer for the purposes of any rule here.
const files = readSources().filter((file) => !file.path.endsWith(".d.ts"));
const graph = buildGraph(files);
const byPath = new Map(files.map((file) => [file.path, file]));

/** Every module a worker's entry point can reach, itself included. */
function reachableFromWorkers(): readonly string[] {
  const seen = new Set<string>();
  for (const file of files) {
    if (!file.path.endsWith(".worker.ts")) continue;
    seen.add(file.path);
    for (const reached of reachableFrom(graph, file.path)) seen.add(reached);
  }
  return [...seen];
}

describe("the workers", () => {
  it("there is a worker to check", () => {
    // The suite below is a set of absences, and a suite of absences over an
    // empty list passes while proving nothing.
    expect(reachableFromWorkers().length).toBeGreaterThan(5);
  });

  it("no code a worker runs touches the DOM", () => {
    /*
     * A requirement of the threat model rather than an optimisation. A whole
     * class of risk - parsing strangers' binary formats - has left the server
     * and arrived in the person's tab, and the worker is the box it is kept in.
     * A worker that reached the page would have taken the box off.
     */
    const dom = /\b(document\.|window\.|localStorage|sessionStorage|navigator\.|alert\()/;
    const offenders = reachableFromWorkers().filter((path) => {
      const file = byPath.get(path);
      return file !== undefined && dom.test(file.text);
    });
    expect(offenders).toEqual([]);
  });

  it("no code a worker runs touches the network", () => {
    const network =
      /\b(fetch\(|new XMLHttpRequest|navigator\.sendBeacon|new EventSource|new WebSocket|importScripts)/;
    const offenders = reachableFromWorkers().filter((path) => {
      const file = byPath.get(path);
      return file !== undefined && network.test(file.text);
    });
    expect(offenders).toEqual([]);
  });

  it("the parsers are reachable from the workers and from nowhere else", () => {
    // This is what "nothing is parsed outside a worker" means in code. The one
    // door out is `src/workers/index.ts`, which re-exports the few things a
    // screen needs - a failure it can read, a verdict on a text.
    const offenders: string[] = [];
    for (const file of files) {
      if (
        file.path.startsWith("src/workers/") ||
        file.path.startsWith("src/lib/parse/") ||
        file.path.startsWith("src/test/")
      ) {
        continue;
      }
      for (const specifier of [...file.imports, ...file.dynamicImports]) {
        const resolved = resolveSpecifier(file.path, specifier) ?? specifier;
        if (/^src\/lib\/parse/.test(resolved))
          offenders.push(`${file.path} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the parsing libraries are named in one place", () => {
    // pdf.js, mammoth, turndown and the zip reader are tens of kilobytes each
    // and they arrive with the document that needs them. Imported from a
    // screen, one of them would join the first paint instead.
    const libraries = [
      "pdfjs-dist",
      "mammoth",
      "turndown",
      "@joplin/turndown-plugin-gfm",
      "@mixmark-io/domino",
      "fflate",
    ];
    const offenders: string[] = [];
    for (const file of files) {
      if (file.path.startsWith("src/lib/parse/") || file.path.startsWith("src/test/")) {
        continue;
      }
      for (const specifier of [...file.imports, ...file.dynamicImports]) {
        if (libraries.some((library) => specifier.startsWith(library))) {
          offenders.push(`${file.path} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the heavy parsers are reached through import() alone", () => {
    // Statically imported, pdf.js would be in the chunk of every document -
    // including the person who brought a `.bib` and will never open a PDF.
    const heavy = ["pdfjs-dist", "mammoth", "turndown"];
    const offenders: string[] = [];
    for (const file of files) {
      if (file.path.startsWith("src/test/")) continue;
      for (const specifier of file.imports) {
        if (heavy.some((library) => specifier.startsWith(library))) {
          // The parser modules themselves are the leaves that `import()` reaches.
          if (/^src\/lib\/parse\/(pdf|docx)\.ts$/.test(file.path)) continue;
          offenders.push(`${file.path} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("one markdown parser", () => {
  /**
   * markdown-it is the project's markdown parser, and there is no second one
   * under any pretext. It arrives with the `.docx` export path, where
   * `render()` is what builds the HTML a Word file is assembled from; until
   * then the rule is all there is to hold, because a second parser added now
   * is a second parser to remove later.
   *
   * The grammar CodeMirror highlights with is not one of these. It reads text
   * to colour it and produces no document, and swapping it for markdown-it
   * would mean writing a syntax highlighter by hand.
   */
  const rivals = [
    "marked",
    "showdown",
    "remark-parse",
    "micromark",
    "commonmark",
    "markdown-it-py",
    "snarkdown",
    "@markdoc/markdoc",
  ];

  it("nothing in the application imports a second one", () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const specifier of [...file.imports, ...file.dynamicImports]) {
        if (
          rivals.some((rival) => specifier === rival || specifier.startsWith(`${rival}/`))
        ) {
          offenders.push(`${file.path} -> ${specifier}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
