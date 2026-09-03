import { readFileSync } from "node:fs";
import { readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { brand } from "../../brand.config";

/**
 * Three ten-line tests that remove three classes of future rework. Each is
 * cheap exactly now: switched on over finished code, it produces a list of
 * exceptions, and a list of exceptions never gets shorter.
 */
const SRC = resolve(process.cwd(), "src");
const TOKENS = join(SRC, "app", "tokens.css").split(sep).join("/");

function files(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files(full, acc);
    else if (/\.(ts|tsx|css|json)$/.test(entry)) acc.push(full.split(sep).join("/"));
  }
  return acc;
}

// The tests themselves mention the forbidden strings - otherwise they would
// have nothing to search for.
const sources = files(SRC)
  .filter((path) => !path.includes("/test/"))
  .map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("grep rules over the source", () => {
  it("the product name does not appear in src/", () => {
    // Rebranding has to be an edit to brand.config.ts, not to a hundred files.
    const offenders = sources
      .filter((file) => file.text.includes(brand.name))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("the secure-context-only cryptography is reached through one module", () => {
    /*
     * `crypto.randomUUID` and `crypto.subtle` exist only in a secure context -
     * https and localhost, and not a build opened over plain http from another
     * machine, which is a case the project invites by name. Called directly,
     * each of them takes out something the product cannot work without: the
     * identifier every document is given, the key that makes a submission
     * repeatable, the hash the place of every finding is checked against. They
     * are reached through `lib/webcrypto`, which has a way through for both.
     */
    const offenders = sources
      .filter((file) => !file.path.endsWith("/lib/webcrypto.ts"))
      .filter(
        (file) =>
          file.text.includes("crypto.randomUUID") || file.text.includes("crypto.subtle"),
      )
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("dangerouslySetInnerHTML appears nowhere", () => {
    // Markdown from someone else's document must not become an XSS vector.
    const offenders = sources
      .filter((file) => file.text.includes("dangerouslySetInnerHTML"))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  /**
   * A module sends a dictionary key and its substitutions, never a ready-made
   * sentence, so every one of those keys is someone else's data - and a key
   * this release has no wording for is an ordinary thing to receive, since the
   * server gains a check before the client that draws it is deployed. Looked up
   * blindly it reaches the screen as its own path, and the same string is
   * written into the report the person takes away.
   *
   * `useWording` is the lookup that answers such a key with a sentence instead.
   * The rule is that the fields carrying server keys never reach any other one:
   * checked here rather than remembered, because the failure is invisible on
   * the mocks, whose keys are all in the dictionary by construction.
   */
  it("a key the server sent is looked up through the guard, never directly", () => {
    const serverKey = /(?:titleKey|headlineKey|labelKey|detailKey|skippedReasonKey)/;
    const offenders = sources
      .filter((file) => serverKey.test(file.text))
      // The domain and the mappers name the fields; only the screens look them up.
      .filter(
        (file) => file.path.includes("/features/") || file.path.includes("/components/"),
      )
      .filter((file) => !file.text.includes("useWording"))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("the dictionary has the sentence the guard falls back to", () => {
    const dictionary = readFileSync("src/messages/en.json", "utf8");
    expect(JSON.parse(dictionary)).toHaveProperty("wording.unknown");
  });

  /**
   * Every text in this repository explains itself. The planning documents live
   * outside it, they are edited without anyone here noticing, and their
   * numbering moves - so a comment that sends the reader to a section, or a
   * paragraph that dates a capability by a stage code, is a sentence that
   * quietly becomes wrong and cannot be checked from inside the code. It also
   * fails the reader who has the file open and not the document.
   *
   * Where a reference was carrying the explanation, the replacement is to say
   * the thing itself: not "the storage arrives at such a stage" but "storage
   * that survives a reload is not built yet".
   *
   * The scan is over what a developer reads while working here. The two scripts
   * that lift the contract out of the agreed API document are outside it and
   * name that document by path on purpose: reading it is what they are for.
   */
  it("nothing sends the reader to a document outside the repository", () => {
    const pointer =
      /§|\brefscout_[a-z_]+\.(?:md|html)\b|\bthe (?:specification|workplan|work plan|prototype)\b|\bsee the spec\b|\bmilestone\b|\bsection \d+ of\b/i;
    const prose = [
      ...sources.filter((file) => !file.path.endsWith(".gen.ts")),
      { path: "README.md", text: readFileSync("README.md", "utf8") },
    ];
    const offenders = prose
      .filter((file) => pointer.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("colours appear nowhere outside the tokens file", () => {
    // The dark theme drifts away from the light one one hard-coded colour at a time.
    const color = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
    const offenders = sources
      .filter((file) => file.path !== TOKENS && color.test(file.text))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
