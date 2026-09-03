/**
 * The two things this product needs from the platform's cryptography, and what
 * it does when the platform will not give them.
 *
 * `crypto.randomUUID` and `crypto.subtle` exist only in a secure context. That
 * is https and it is also localhost, so it covers the site and it covers a
 * developer's own machine - and it does not cover the case the project asks for
 * by name: a build served over plain http and opened somewhere else. A phone on
 * the same network reaching a laptop by its address, a stand on an internal
 * host, an old device somebody is checking a worker on. There both functions are
 * simply absent, and absent they take out the identifier every document is
 * given, the key that makes a submission repeatable and the hash the places of
 * every finding are checked against - which is the whole product, failing on
 * the first file, for a reason nothing on screen could explain.
 *
 * So both have a way through. Neither weakens anything: the randomness comes
 * from the same generator, which is not gated, and the digest is computed by an
 * audited implementation of the same function.
 */

/**
 * A fresh identifier. It names documents, worker messages, telemetry events and
 * the intention behind a submission; none of them is a secret, and what is
 * required of it is only that two of them never collide.
 */
export function newId(): string {
  try {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // A browser that throws on the property is a browser without it.
  }
  return uuidFromRandomBytes() ?? `${Date.now().toString(36)}-${randomSuffix()}`;
}

/**
 * The same value `randomUUID` would have produced, from the generator that is
 * available everywhere. `getRandomValues` is not restricted to a secure
 * context, so the version below is a formatting difference and not a weaker
 * identifier.
 */
function uuidFromRandomBytes(): string | undefined {
  try {
    if (typeof crypto.getRandomValues !== "function") return undefined;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    // Version 4, variant 1: the two fields a v4 UUID fixes.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  } catch {
    return undefined;
  }
}

/** The last resort, for a runtime with no generator at all. */
function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * SHA-256 of the given bytes.
 *
 * `crypto.subtle` does it where it exists, which is everywhere the product is
 * actually used, and the implementation is the platform's own. Where it does
 * not, the same function arrives through `import()` - so the cost is paid by
 * the page that has no other way and by nobody else, and it is not a second
 * implementation of the algorithm written here by hand.
 */
export async function digestSha256(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof crypto.subtle?.digest === "function") {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      bytes as Uint8Array<ArrayBuffer>,
    );
    return new Uint8Array(digest);
  }
  const { sha256 } = await import("@noble/hashes/sha2.js");
  return sha256(bytes);
}
