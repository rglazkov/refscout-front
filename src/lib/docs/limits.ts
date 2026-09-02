import { type FilledSlot } from "@/lib/domain";

/**
 * The intake limits. Text volume is the real limit: all four places where the
 * interface says "characters" count in the same unit, and the server counts in
 * that unit too.
 *
 * The refusals below are the client's half of the same rule the server states
 * with DOC_TOO_LARGE, JOB_TOO_LARGE and TOO_MANY_DOCUMENTS. Checking here as
 * well is not duplication: it lets the card say the number before a
 * three-million-character document is sent anywhere.
 *
 * A document and an attachment are measured against different numbers, because
 * they are different things. The buffer holds manuscripts, and a manuscript is
 * a book-length work; a bibliography, a glossary file and a venue's
 * requirements hang off one and are a fraction of its size. One ceiling for
 * both would let a second dissertation in through the glossary slot.
 */
export const limits = {
  /** Per document, before extraction. */
  maxFileBytes: 100 * 1024 * 1024,
  /**
   * Texts held in the browser at once. A text a check reads counts among them,
   * because it occupies the same storage and the same memory as any other: a
   * manuscript brought with its bibliography and its glossary file is three of
   * these, not one.
   */
  maxDocuments: 50,
  /** In code points, per document. */
  maxDocChars: 3_000_000,
  /**
   * In code points, over everything one check reads: the document it is ticked
   * on together with the texts it reads alongside it - the bibliography behind
   * a manuscript, the glossary file, the venue's requirements. The ceiling is
   * set by the composition rather than as a fraction of the document's own:
   * beside a manuscript at its limit there has to be room for a bibliography of
   * two thousand sources, a glossary and a page of requirements.
   */
  maxCheckChars: 8_000_000,
  /** In code points, over the whole buffer. */
  maxBufferChars: 12_000_000,
  /**
   * The attachments, by the slot they fill. A dissertation cites on the order
   * of a thousand works, and a BibTeX entry runs to a few hundred characters,
   * so a million is room to spare rather than a wall. A glossary file and a
   * page of author guidelines are smaller again by an order of magnitude.
   */
  attachment: {
    bibcheck: { maxFileBytes: 16 * 1024 * 1024, maxChars: 1_000_000 },
    glossary: { maxFileBytes: 4 * 1024 * 1024, maxChars: 200_000 },
    venue: { maxFileBytes: 4 * 1024 * 1024, maxChars: 200_000 },
    /** Written by a check rather than brought in, and never refused. */
    artifact: { maxFileBytes: Infinity, maxChars: Infinity },
  },
  /**
   * The paragraph or draft section pasted into Cite's box. A section of a
   * thesis rather than a sentence, and still far short of a document.
   */
  maxCiteExcerptChars: 50_000,
  /**
   * What a `.docx` container may cost while it is being opened. A zip is the
   * classic way to spend a tab's whole memory on a small file, and these are
   * the numbers the card prints when one tries: how many entries, how much was
   * unpacked, and what the ceiling was.
   */
  archive: {
    /** A Word file of any size has tens of parts; a thousand is not one. */
    maxEntries: 1_000,
    maxEntryBytes: 150 * 1024 * 1024,
    /** Everything taken out of one container, added up. */
    maxUnpackedBytes: 300 * 1024 * 1024,
    /** Unpacked bytes per packed byte. Ordinary Word XML sits well under 20:1. */
    maxRatio: 200,
  },
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
  | {
      readonly code: "ATTACHMENT_TOO_LARGE";
      readonly slot: FilledSlot;
      readonly chars: number;
      readonly limit: number;
    }
  /**
   * One check would read more than a check may read: the document and what
   * hangs off it, taken together.
   */
  | { readonly code: "CHECK_TOO_LARGE"; readonly chars: number; readonly limit: number }
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

/**
 * Checked after extraction, because until then the number of characters is
 * unknown. It takes the count rather than the text: the count was made where
 * the text was, in one walk, and asking for it again here would be a second
 * walk over three million characters to learn a number we already have.
 */
export function refuseByVolume(chars: number, bufferChars: number): IntakeRefusal | null {
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

/** The same two questions for an attachment, against the ceiling of its slot. */
export function refuseAttachmentBySize(
  slot: FilledSlot,
  size: number,
): IntakeRefusal | null {
  const limit = limits.attachment[slot].maxFileBytes;
  return size > limit ? { code: "FILE_TOO_LARGE", size, limit } : null;
}

export function refuseAttachmentByVolume(
  slot: FilledSlot,
  chars: number,
  /**
   * What the check already reads: the document this hangs off, and whatever
   * else is hanging off it. Without it the slot ceilings alone would let a
   * check be assembled past the ceiling of the check.
   */
  checkChars = 0,
): IntakeRefusal | null {
  const limit = limits.attachment[slot].maxChars;
  if (chars > limit) return { code: "ATTACHMENT_TOO_LARGE", slot, chars, limit };
  const total = checkChars + chars;
  return total > limits.maxCheckChars
    ? { code: "CHECK_TOO_LARGE", chars: total, limit: limits.maxCheckChars }
    : null;
}
