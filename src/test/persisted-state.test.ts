import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readSources } from "./utils/source-graph";

/**
 * The persisted-state shape test, which now has documents to guard rather than
 * an absence to record.
 *
 * The rule is unchanged and it is the one rule: content may live in IndexedDB
 * and nowhere else. Not in a Zustand persist store, not in localStorage, not in
 * the queue of unsent reports, and not in Cache Storage - the last is not a
 * clause for the future, because the offline shell exists and the reason it
 * never touches an API request is exactly this.
 *
 * There is precisely one store where content is allowed, and this is the
 * automatic check that says so.
 */

/** The modules allowed to write to localStorage, and the keys they write. */
const localStorageWriters: ReadonlyArray<{
  readonly module: string;
  readonly keys: readonly string[];
}> = [
  { module: "src/lib/theme/", keys: ["theme"] },
  // Whether automatic error reports are sent. It sits beside the theme for the
  // same reason: it is a choice about this browser rather than about an
  // account, so it belongs to the browser and travels nowhere.
  { module: "src/lib/telemetry/", keys: ["telemetry"] },
];

/** The fields document contents live in. They cannot appear in persisted state. */
const contentFields = [
  "text",
  "sourceText",
  "content",
  "pages",
  "fileName",
  "quote",
  "password",
] as const;

/**
 * The modules allowed to open a database. Everything else reaches storage
 * through `lib/storage`, which is what makes "one place where content lives"
 * something that can be checked rather than asserted.
 */
const databaseWriters = [
  "src/lib/storage/",
  // Its own database and its own module. The separation is not about what
  // could leak out of the queue - an event is numbers, flags and codes - but
  // about what could get in: a queue sharing a store with the documents would
  // be one careless write away from carrying a manuscript to a server.
  "src/lib/telemetry/",
];

const sources = readSources();

describe("persisted state", () => {
  it("only the declared modules write to localStorage", () => {
    const offenders = sources
      .filter((file) => /localStorage\.setItem\s*\(/.test(file.text))
      .filter(
        (file) =>
          !localStorageWriters.some((writer) => file.path.startsWith(writer.module)),
      )
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("the declared localStorage keys hold no content fields", () => {
    const declared = localStorageWriters.flatMap((writer) => writer.keys);
    expect(
      declared.filter((key) => (contentFields as readonly string[]).includes(key)),
    ).toEqual([]);
  });

  it("no store is persisted by Zustand, so no store can carry a text into one", () => {
    const persisted = sources
      .filter((file) => file.path.startsWith("src/stores/"))
      .filter((file) => /\bpersist\s*\(/.test(file.text))
      .map((file) => file.path);
    expect(persisted).toEqual([]);
  });

  it("no store holds a document's text", () => {
    // The descriptions of the documents live in the stores and the texts live
    // in the registry behind them. A text that has once been in a store is in
    // the serialised state and in the error report soon after.
    const offenders = sources
      .filter((file) => file.path.startsWith("src/stores/"))
      .filter((file) => /\breadonly text\s*:/.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("only the storage module and the report queue open a database", () => {
    const offenders = sources
      .filter((file) => /\bopenDB\s*\(|\bindexedDB\.open\s*\(/.test(file.text))
      .filter((file) => !databaseWriters.some((module) => file.path.startsWith(module)))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("the document record holds one long string and no second copy of the text", () => {
    // The extracted original is kept as a hash and the snapshot of what was
    // sent as a hash and a length. A three-million-code-point manuscript is
    // about six megabytes in the browser's units, and three copies of it would
    // cost eighteen where six is enough.
    const record = readFileSync("src/lib/storage/documents.ts", "utf8");
    const declaration = record.slice(
      record.indexOf("export type DocumentRecord"),
      record.indexOf("export type JournalRecord"),
    );
    const strings = [...declaration.matchAll(/readonly (\w+)\??: string;/g)].map(
      (match) => match[1],
    );
    // The identifier and the hash are short by construction. Everything else
    // that could hold a manuscript has to be the one field that does.
    expect(strings).toEqual(["docId", "text", "originalSha256"]);
  });

  it("the queue of unsent reports takes numbers, flags and enumerations only", () => {
    const events = readFileSync("src/lib/telemetry/events.ts", "utf8");
    expect(events).toMatch(/EventContext = Readonly<Record<string, number \| boolean>>/);
  });

  it("the service worker never answers a request to the API", () => {
    // A cached response would be a second copy of the analysis of somebody's
    // manuscript living outside IndexedDB: past the button that deletes saved
    // documents, past the sweep, and past this test.
    const worker = readFileSync("src/sw/service-worker.ts", "utf8");
    const runtime = /matcher:\s*\(\{([^}]*)\}\)\s*=>\s*([\s\S]*?),\n\s{6}handler/g;
    const matchers = [...worker.matchAll(runtime)].map((match) => match[2] ?? "");
    expect(matchers.length).toBeGreaterThan(0);
    for (const matcher of matchers) expect(matcher).toContain("sameOrigin");
  });

  it("a new version of the shell is applied only by a press", () => {
    /*
     * The code changes together with the schema of the storage and its
     * migrations, and a tab may be holding an open document - so a version that
     * took over on its own would be a migration in the middle of somebody's
     * work. The rule is two lines of configuration, and this is what keeps them
     * from being loosened without anybody noticing.
     */
    const worker = readFileSync("src/sw/service-worker.ts", "utf8");
    expect(worker).toMatch(/skipWaiting:\s*false/);
    expect(worker).toMatch(/clientsClaim:\s*false/);

    // The one call, and it is inside the handler for the message the interface
    // sends when the person asks for the new version.
    const calls = worker.match(/skipWaiting\(\)/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(worker).toMatch(/apply-update[\s\S]{0,200}skipWaiting\(\)/);
  });

  it("the inline theme script writes nothing but the attribute", () => {
    const script = readFileSync("src/lib/theme/script.ts", "utf8");
    expect(script).not.toMatch(/setItem/);
  });
});
