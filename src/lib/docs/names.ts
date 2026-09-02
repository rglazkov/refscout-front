import { isTextFormat, type SourceFormat } from "@/lib/domain";

/**
 * A document's name arrives from someone else's file system and ends up in the
 * DOM, in a download dialogue and in the user's own folder. It is sanitised for
 * display and for the file we hand back; what travels to the server is the raw
 * name, so that a document named in a support conversation can be found
 * again.
 */
const MAX_NAME_LENGTH = 80;

/**
 * Control characters, and the bidirectional overrides with them. U+202E turns
 * `exploit.exe.txt` into what reads as `exploit.txt.exe`, which is the oldest
 * trick there is for making a file look like something it is not.
 */
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** Separators, so that a name can never climb out of the folder it is saved into. */
const SEPARATORS = /[\\/]+/g;

export function sanitizeDocumentName(rawName: string): string {
  const stripped = rawName
    .replace(UNSAFE, "")
    .replace(SEPARATORS, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\s_]+/, "")
    .trim();

  const name = stripped === "" ? "document" : stripped.normalize("NFC");
  if ([...name].length <= MAX_NAME_LENGTH) return name;

  // Trimmed before the extension rather than after it: the extension is the
  // part of a long name that still carries meaning, and a name cut down to
  // "supplementary_material_" says less than "supplementary_ma….bib".
  const extension = /\.[A-Za-z0-9]{1,8}$/.exec(name)?.[0] ?? "";
  const stem = [...name.slice(0, name.length - extension.length)];
  const room = MAX_NAME_LENGTH - [...extension].length - 1;
  return `${stem.slice(0, room).join("")}…${extension}`;
}

/**
 * The name a download is offered under. It is built from the document's own
 * name so that the corrected file lands next to the original instead of
 * becoming `download (3).txt`.
 */
export function downloadName(
  documentName: string,
  suffix: string,
  extension: string,
): string {
  const base = sanitizeDocumentName(documentName).replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const stem = base === "" ? "document" : base;
  return `${stem}${suffix}.${extension}`;
}

/**
 * The extension a document is handed back under. The rule is "the format it was
 * brought in", and the exceptions are the formats the browser cannot build yet.
 * Each loses its exception when its builder is written, and the rule above it
 * does not change.
 *
 * Word is the interesting one. From the moment it is converted it lives in the
 * buffer as markdown - that is the text the person reads, corrects and sends -
 * so `.md` is not a downgrade of the file but the honest name for what is being
 * handed over. PDF and typed text have no such form and come back as `.txt`.
 */
export function downloadExtensionOf(format: SourceFormat): string {
  if (isTextFormat(format)) return format;
  return format === "docx" ? "md" : "txt";
}
