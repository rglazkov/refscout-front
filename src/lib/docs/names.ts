import { isTextFormat, type DetectedKind, type SourceFormat } from "@/lib/domain";

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
 * The extension a document is handed back under, and the rule is the whole of
 * it: the format it was brought in. A `.docx` comes back a `.docx`, a `.tex`
 * comes back a `.tex`, and it is the same rule in the main check and in a
 * comparison, because both ask it here.
 *
 * One exception is left and it is permanent. A PDF comes back as `.txt`,
 * because we do not build PDFs: that means a document generator in the bundle
 * and a return to the binary formats the product moved away from, and the
 * program somebody writes their manuscript in makes a better one anyway. Text
 * that was typed or pasted comes back as `.txt` for the plainer reason that it
 * never had a format of its own.
 */
export function downloadExtensionOf(format: SourceFormat): string {
  if (isTextFormat(format)) return format;
  return format === "docx" ? "docx" : "txt";
}

/**
 * The same question for a text that was never a file. What it is handed back as
 * is read from the text itself, because that is the only thing there is to
 * read: somebody who pasted a hundred BibTeX entries brought a bibliography,
 * whatever the absence of a file says.
 */
function typedExtensionOf(detected: DetectedKind): string {
  if (detected === "bibtex") return "bib";
  if (detected === "latex") return "tex";
  if (detected === "markdown") return "md";
  return "txt";
}

/**
 * Every extension this document may be handed back under, the one the rule
 * chose standing first.
 *
 * The list is worked out from what the text *is*, and that is the whole of its
 * design. A fixed list of every format the product knows would offer to save a
 * LaTeX source as `.docx` and a Word document as `.tex` - and neither of those
 * is a conversion, because there is nothing here that turns `\section` into a
 * Word heading or a Word heading into `\section`. What the person would get is
 * their own text under a wrong extension, full of the wrong markup, and they
 * would find that out by opening it in the program the extension named.
 *
 * So only three kinds of entry are ever in the list, and each of them is true.
 * The format it came in, always first and labelled as such. A format the
 * product genuinely converts to: `.docx` from markdown, which is built in a
 * worker, and `.ris` from a bibliography, which is read by citation-js and
 * written out again. And `.txt`, which is not a conversion at all but the same
 * characters under the plainest extension there is - offered because a tool
 * downstream sometimes asks for one, and honest because nothing about the text
 * is claimed by it.
 *
 * A document whose list has one entry has no choice to make, and the interface
 * draws no menu for it.
 */
export function downloadFormatsOf(
  format: SourceFormat,
  detected: DetectedKind = "unknown",
): readonly string[] {
  const native =
    format === "typed" ? typedExtensionOf(detected) : downloadExtensionOf(format);
  const offered = [native];

  // Markdown is the one text the product can pack into a container, and the
  // Word document it packs it into is the format most of these documents
  // arrived as.
  if (native === "docx") offered.push("md");
  if (native === "md") offered.push("docx");
  // A bibliography is the one text whose entries the product reads apart from
  // the characters they are written in, so it is the one that can be written
  // out in another bibliographic format.
  if (native === "bib") offered.push("ris");

  if (native !== "txt") offered.push("txt");
  return offered;
}
