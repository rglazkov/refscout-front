import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { errorCodes, isKnownErrorCode, messageKeyFor } from "@/lib/api";

/**
 * Every code the contract names has a sentence in the person's language
 * (M1.7.7). A code that is missing from the dictionary is a person reading
 * "something went wrong" about a refusal we could have explained, so the
 * dictionary is checked against the contract rather than against memory.
 *
 * The direction matters. An unfamiliar code is drawn as the general refusal
 * with a visible request identifier, which is what lets the server add a code
 * without breaking a client that has already shipped - so the test asks that
 * the contract's codes are covered, not that ours are all still used.
 */
const contract = readFileSync("contract/refscout-api.yaml", "utf8");

/**
 * The codes the contract's error examples carry. They are read out of the
 * `error:` envelopes, so the codes of findings - which live under the same
 * `code` key on an issue - are not mistaken for refusals.
 */
function codesInContract(): string[] {
  const found = new Set<string>();
  const lines = contract.split("\n");
  lines.forEach((line, index) => {
    if (!/^\s*error:\s*$/.test(line)) return;
    for (let ahead = index + 1; ahead < index + 4 && ahead < lines.length; ahead += 1) {
      const code = /^\s*code:\s*([A-Z][A-Z0-9_]*)\s*$/.exec(lines[ahead] ?? "");
      if (code?.[1] !== undefined) found.add(code[1]);
    }
  });
  return [...found].sort();
}

const dictionary = JSON.parse(readFileSync("src/messages/en.json", "utf8")) as {
  errors: { codes: Record<string, string>; unknown: string };
};

describe("the dictionary of refusals covers the contract", () => {
  it("the contract names at least the refusals the screens branch on", () => {
    // A sanity check on the reading above: if it silently found nothing, every
    // assertion below would pass while proving nothing.
    expect(codesInContract().length).toBeGreaterThan(5);
  });

  it("every code the contract names is in our enumeration", () => {
    const missing = codesInContract().filter((code) => !isKnownErrorCode(code));
    expect(missing).toEqual([]);
  });

  it("every code in our enumeration has a sentence", () => {
    const missing = errorCodes.filter(
      (code) => dictionary.errors.codes[code] === undefined,
    );
    expect(missing).toEqual([]);
  });

  it("an unfamiliar code falls back rather than showing nothing", () => {
    expect(messageKeyFor("A_CODE_INVENTED_TOMORROW")).toBe("errors.unknown");
    expect(dictionary.errors.unknown).not.toBe("");
  });

  it("a known code is looked up under its own key", () => {
    expect(messageKeyFor("RATE_LIMITED")).toBe("errors.codes.RATE_LIMITED");
  });
});
