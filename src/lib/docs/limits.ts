import { countCodePoints } from "./units";

/**
 * The intake limits (M1.3.5). Text volume is the real limit: all four places
 * where the interface says "characters" count in the same unit, and the server
 * counts in that unit too.
 *
 * The refusals below are the client's half of the same rule the server states
 * with DOC_TOO_LARGE, JOB_TOO_LARGE and TOO_MANY_DOCUMENTS. Checking here as
 * well is not duplication: it lets the card say the number before a
 * three-million-character document is sent anywhere.
 */
export const limits = {
  /** Per file, before extraction. */
  maxFileBytes: 100 * 1024 * 1024,
  maxDocuments: 50,
  /** In code points, per document. */
  maxDocChars: 3_000_000,
  /** In code points, over the documents one check runs on. */
  maxCheckChars: 8_000_000,
  /** In code points, over the whole buffer. */
  maxBufferChars: 12_000_000,
} as const;

export type IntakeRefusal =
  | { readonly code: "FILE_TOO_LARGE"; readonly size: number; readonly limit: number }
  | {
      readonly code: "TOO_MANY_DOCUMENTS";
      readonly count: number;
      readonly limit: number;
    }
  | { readonly code: "DOC_TOO_LARGE"; readonly chars: number; readonly limit: number }
  | { readonly code: "JOB_TOO_LARGE"; readonly chars: number; readonly limit: number }
  | { readonly code: "UNSUPPORTED_FORMAT"; readonly extension: string };

/** Checked before the file is read, so a 400 MB video is refused without being loaded. */
export function refuseBySize(size: number): IntakeRefusal | null {
  return size > limits.maxFileBytes
    ? { code: "FILE_TOO_LARGE", size, limit: limits.maxFileBytes }
    : null;
}

export function refuseByCount(existing: number, incoming: number): IntakeRefusal | null {
  const count = existing + incoming;
  return count > limits.maxDocuments
    ? { code: "TOO_MANY_DOCUMENTS", count, limit: limits.maxDocuments }
    : null;
}

/** Checked after extraction, because until then the number of characters is unknown. */
export function refuseByVolume(text: string, bufferChars: number): IntakeRefusal | null {
  const chars = countCodePoints(text);
  if (chars > limits.maxDocChars) {
    return { code: "DOC_TOO_LARGE", chars, limit: limits.maxDocChars };
  }
  if (bufferChars + chars > limits.maxBufferChars) {
    return {
      code: "JOB_TOO_LARGE",
      chars: bufferChars + chars,
      limit: limits.maxBufferChars,
    };
  }
  return null;
}
