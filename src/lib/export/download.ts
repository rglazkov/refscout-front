import { docRegistry, downloadName } from "@/lib/docs";

/**
 * One mechanism for every download in the product (M1.10.1). Text into a Blob
 * with an explicit type, a link carrying `download`, and the object URL
 * released immediately afterwards.
 *
 * Not opened in a tab. A manuscript opened instead of saved is also an address,
 * and that address stays in the browser's history.
 */
export function download(content: string, fileName: string, mediaType: string): void {
  const blob = new Blob([content], { type: `${mediaType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Released at once rather than on unload: a tab that stays open for an
  // afternoon of downloads otherwise holds every manuscript it produced.
  URL.revokeObjectURL(url);
}

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  bib: "application/x-bibtex",
  tex: "application/x-tex",
  gls: "application/x-tex",
  md: "text/markdown",
  txt: "text/plain",
};

export function mediaTypeFor(extension: string): string {
  return MEDIA_TYPES[extension] ?? "text/plain";
}

/**
 * The text of a document, in the extension it arrived under. At this milestone
 * every format is text, so "downloads in the format it was brought in" is
 * literally true; PDF and Word get their exceptions in M2 and lose them in M10
 * (M1.10.3).
 */
export function downloadDocumentText(
  docId: string,
  documentName: string,
  extension: string,
): boolean {
  const content = docRegistry.get(docId);
  if (content === undefined) return false;

  // The line endings and the byte-order mark are put back as the file had them,
  // so what is saved differs from what was opened in nothing at all (§18).
  const body =
    content.eol === "\n" ? content.text : content.text.split("\n").join(content.eol);
  const text = content.hadBom ? `\u{feff}${body}` : body;

  download(text, downloadName(documentName, "", extension), mediaTypeFor(extension));
  return true;
}

/**
 * An artifact the server generated - a corrected bibliography, a glossary. It
 * arrives as text in the body, so the file is assembled here and there is no
 * address anywhere from which the contents of a manuscript would come back off
 * a server (M1.10.4).
 */
export function downloadText(
  content: string,
  documentName: string,
  suffix: string,
  extension: string,
): void {
  download(
    content,
    downloadName(documentName, suffix, extension),
    mediaTypeFor(extension),
  );
}
