import { Unzip, UnzipInflate, zipSync } from "fflate";

import { limits } from "@/lib/docs/limits";

import { ParseFailure } from "./failure";

/**
 * Opening a `.docx` container. A `.docx` is a zip, and a zip brought in by a
 * stranger is the classic way to spend all of a tab's memory on a two-kilobyte
 * file. So the container is never simply unpacked: a named list of entries is
 * taken out of it and a fresh archive holding only those is what the converter
 * is given.
 *
 * The whitelist matters as much as the ceilings. `word/media/**` is where the
 * pictures live and it is never read at all - images are dropped in the
 * conversion anyway, so unpacking them would be spending memory on bytes with
 * no destination.
 */
const WANTED = new Set([
  "[Content_Types].xml",
  "_rels/.rels",
  "word/document.xml",
  "word/_rels/document.xml.rels",
  "word/footnotes.xml",
  "word/endnotes.xml",
  "word/numbering.xml",
  "word/styles.xml",
]);

/**
 * What the archive actually cost us, in numbers the card can print. Every
 * refusal here says which ceiling was met and by how much: "this archive is too
 * big" on its own leaves a person with nothing to act on.
 */
export type ArchiveReport = {
  readonly entries: number;
  readonly unpacked: number;
};

/**
 * Reads the whitelisted parts out and returns a plain, uncompressed archive of
 * just those. Every ceiling in `limits.archive` is checked against what is
 * really produced rather than against what the directory claims: the declared
 * size is written by whoever made the file, so it earns an early refusal and
 * nothing more.
 *
 * The ceilings are a parameter so that a test can meet them on a small archive.
 * Reaching the real ones honestly would mean inflating three hundred megabytes
 * inside a test process, and a ceiling nothing ever crosses is a ceiling whose
 * refusal nobody has read.
 */
export function openContainer(
  bytes: Uint8Array,
  ceilings: typeof limits.archive = limits.archive,
): {
  readonly container: Uint8Array;
  readonly report: ArchiveReport;
} {
  const parts: Record<string, Uint8Array> = {};
  let entries = 0;
  let unpacked = 0;
  let failure: ParseFailure | null = null;

  const unzip = new Unzip();
  unzip.register(UnzipInflate);

  unzip.onfile = (file) => {
    entries += 1;
    if (entries > ceilings.maxEntries) {
      failure ??= new ParseFailure("ARCHIVE_TOO_MANY_ENTRIES", {
        entries,
        limit: ceilings.maxEntries,
      });
      return;
    }
    if (failure !== null || !WANTED.has(file.name)) return;

    // The catalogue's own numbers, used for the cheap refusals: they cost
    // nothing to read and they turn away the obvious cases before a single
    // byte is inflated.
    const declared = file.originalSize ?? 0;
    const packed = file.size ?? 0;
    if (declared > ceilings.maxEntryBytes) {
      failure ??= new ParseFailure("ARCHIVE_ENTRY_TOO_LARGE", {
        bytes: declared,
        limit: ceilings.maxEntryBytes,
      });
      return;
    }
    if (packed > 0 && declared / packed > ceilings.maxRatio) {
      failure ??= new ParseFailure("ARCHIVE_RATIO_TOO_HIGH", {
        unpacked: declared,
        packed,
        limit: ceilings.maxRatio,
      });
      return;
    }

    const chunks: Uint8Array[] = [];
    let written = 0;
    file.ondata = (error, chunk, final) => {
      if (failure !== null) return;
      if (error !== null) {
        failure = new ParseFailure("DOCX_UNREADABLE");
        return;
      }
      // The counter that is actually the protection. It runs over the stream as
      // it inflates, so an entry that lied about its size in the catalogue is
      // stopped at the ceiling rather than after it has been allocated.
      written += chunk.length;
      unpacked += chunk.length;
      if (written > ceilings.maxEntryBytes) {
        failure = new ParseFailure("ARCHIVE_ENTRY_TOO_LARGE", {
          bytes: written,
          limit: ceilings.maxEntryBytes,
        });
        return;
      }
      // A separate refusal, because it is a separate ceiling with a separate
      // number. Reported as the entry's, it produced a sentence that could not
      // be true - a three-megabyte part said to have passed a limit of a
      // hundred and fifty - and a person cannot act on a number that is wrong.
      if (unpacked > ceilings.maxUnpackedBytes) {
        failure = new ParseFailure("ARCHIVE_TOTAL_TOO_LARGE", {
          unpacked,
          limit: ceilings.maxUnpackedBytes,
        });
        return;
      }
      chunks.push(chunk);
      if (final) parts[file.name] = join(chunks, written);
    };
    file.start();
  };

  try {
    unzip.push(bytes, true);
  } catch {
    failure ??= new ParseFailure("DOCX_UNREADABLE");
  }

  if (failure !== null) throw failure;
  if (
    parts["word/document.xml"] === undefined &&
    parts["[Content_Types].xml"] === undefined
  ) {
    // Not a Word file at all, or a container whose main part is missing. Either
    // way there is nothing here to convert.
    throw new ParseFailure("DOCX_UNREADABLE");
  }

  return {
    // Rebuilt stored rather than deflated: the converter reads it once, in this
    // tab, and compressing bytes on their way from one function to another buys
    // nothing.
    container: zipSync(parts, { level: 0 }),
    report: { entries, unpacked },
  };
}

function join(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}
