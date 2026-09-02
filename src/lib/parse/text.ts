import { fromBytes } from "@/lib/docs/canonical";
import { type SourceFormat } from "@/lib/domain";

import { type Parsed } from "./types";

/**
 * The formats that are already text. There is no library here and there does
 * not need to be one: decoding the bytes, cutting the byte-order mark and
 * canonicalising is the whole of it.
 *
 * It runs in the worker with the others all the same. Not because it is slow -
 * it takes milliseconds - but because "nothing is parsed outside a worker" is
 * an invariant with a test behind it, and an invariant with one exception is a
 * habit rather than a rule.
 */
export function parseText(bytes: Uint8Array, format: SourceFormat): Parsed {
  return { extracted: fromBytes(bytes, format) };
}
