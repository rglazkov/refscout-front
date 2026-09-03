import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readSources } from "./utils/source-graph";

/**
 * The persisted-state shape test. While there are no stores yet it checks empty
 * lists, and that is fine: its job is to already exist by the time the first
 * store appears, not to wait for it.
 *
 * The rule it holds: document contents are allowed in IndexedDB and not allowed
 * in Zustand persist, in localStorage or in the telemetry queue. When the first
 * store appears, its manifest is added here.
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

  it("Zustand persist is not in use yet, and will enter the manifest when it is", () => {
    const persisted = sources
      .filter((file) => file.path.startsWith("src/stores/"))
      .filter((file) => /\bpersist\s*\(/.test(file.text))
      .map((file) => file.path);
    expect(persisted).toEqual([]);
  });

  it("the inline theme script writes nothing but the attribute", () => {
    const script = readFileSync("src/lib/theme/script.ts", "utf8");
    expect(script).not.toMatch(/setItem/);
  });
});
