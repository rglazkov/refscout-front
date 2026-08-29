/**
 * Every measurement of text in this product is in Unicode code points, and this
 * is the only module that knows how to take one. `String.length` counts UTF-16
 * units, which is a different number on exactly the formulas, emoji and CJK a
 * manuscript is made of - and the server counts code points, so two units would
 * disagree precisely where a limit is close (§6, §11, M1.3.5).
 */
export function countCodePoints(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    // A high surrogate followed by a low one is one code point, not two.
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index += 1;
    }
    count += 1;
  }
  return count;
}

/**
 * Words, for the volume shown on a card. A word is a run of anything that is
 * not whitespace: counting by dictionary would be a per-language decision, and
 * the number's job here is to give a sense of scale.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/u).length;
}

/**
 * SHA-256 of the UTF-8 bytes, lowercase hex. This is `textSha256` on the wire:
 * the server recomputes it from what it received, and that is the only proof
 * that the offsets in an answer were counted over our text (§10).
 */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
