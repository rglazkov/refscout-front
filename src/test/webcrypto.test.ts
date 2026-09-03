import { afterEach, describe, expect, it } from "vitest";

import { digestSha256, newId } from "@/lib/webcrypto";

/**
 * The way through when the platform's cryptography is not there.
 *
 * A build served over plain http - a stand on an internal host, a laptop
 * reached from a phone on the same network - has neither `crypto.randomUUID`
 * nor `crypto.subtle`, and without a way through it loses the identifier every
 * document is given and the hash the places of every finding are checked
 * against. The path taken then is exactly the one no browser we develop in ever
 * takes, so it is the one that has to be tested rather than assumed.
 */
const original = {
  randomUUID: Reflect.get(crypto, "randomUUID") as unknown,
  subtle: Reflect.get(crypto, "subtle") as unknown,
};

/** Hides one member of `crypto` for the length of a test. */
function without(member: "randomUUID" | "subtle"): void {
  Object.defineProperty(crypto, member, {
    value: undefined,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Object.defineProperty(crypto, "randomUUID", {
    value: original.randomUUID,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(crypto, "subtle", {
    value: original.subtle,
    configurable: true,
    writable: true,
  });
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * The published digests of the two shortest inputs there are. They are the
 * point of the test: an implementation that agrees with them on an empty input
 * and on three characters has its padding and its length field right, which is
 * where a wrong digest comes from.
 */
const VECTORS = [
  ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
  ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
] as const;

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("an identifier", () => {
  it("is a version 4 UUID, and two of them differ", () => {
    const first = newId();
    expect(first).toMatch(UUID);
    expect(newId()).not.toBe(first);
  });

  it("is still one where randomUUID does not exist", () => {
    without("randomUUID");
    // `getRandomValues` is not restricted to a secure context, so what is lost
    // is the formatting and not the randomness.
    expect(newId()).toMatch(UUID);
    expect(newId()).not.toBe(newId());
  });

  it("is still produced where there is no generator at all", () => {
    without("randomUUID");
    const values = Reflect.get(crypto, "getRandomValues") as unknown;
    Object.defineProperty(crypto, "getRandomValues", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    try {
      // Not a UUID any more, and it does not claim to be: what is required of
      // it here is only that it exists and that two of them differ.
      expect(newId()).not.toBe("");
      expect(newId()).not.toBe(newId());
    } finally {
      Object.defineProperty(crypto, "getRandomValues", {
        value: values,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe("the digest", () => {
  it.each(VECTORS)("of %o is the published one", async (text, expected) => {
    const bytes = new TextEncoder().encode(text);
    expect(hex(await digestSha256(bytes))).toBe(expected);
  });

  it.each(VECTORS)(
    "of %o is the same one without crypto.subtle",
    async (text, expected) => {
      without("subtle");
      const bytes = new TextEncoder().encode(text);
      expect(hex(await digestSha256(bytes))).toBe(expected);
    },
  );

  it("agrees with the platform on a text of a real size", async () => {
    // A hundred thousand characters, because padding is per block and a single
    // block proves only the first one.
    const text = "Пример текста рукописи. ".repeat(4_000);
    const bytes = new TextEncoder().encode(text);
    const platform = hex(await digestSha256(bytes));
    without("subtle");
    expect(hex(await digestSha256(bytes))).toBe(platform);
  });
});
