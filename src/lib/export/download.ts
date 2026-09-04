import { docRegistry, downloadName } from "@/lib/docs";
import { type Eol } from "@/lib/docs/canonical";
import { assembleDocxFile } from "@/workers";

/**
 * One mechanism for every download in the product. The contents into a Blob
 * with an explicit type, a link carrying `download`, and the object URL
 * released immediately afterwards.
 *
 * Not opened in a tab. A manuscript opened instead of saved is also an address,
 * and that address stays in the browser's history.
 */
export function download(content: BlobPart, fileName: string, mediaType: string): void {
  // The charset belongs on text and only on text, so it is said where the type
  // is chosen rather than added to whatever arrives here. A Word file is a zip
  // container, and calling it a zip of UTF-8 characters is untrue of every byte
  // in it.
  const blob = new Blob([content], { type: mediaType });
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

/**
 * The type is taken from the format of the file rather than being one for all
 * of them. A Word file handed over as `text/plain` is a Word file the system
 * offers to open in a text editor.
 */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  bib: "application/x-bibtex;charset=utf-8",
  tex: "application/x-tex;charset=utf-8",
  gls: "application/x-tex;charset=utf-8",
  md: "text/markdown;charset=utf-8",
  txt: "text/plain;charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export function mediaTypeFor(extension: string): string {
  return MEDIA_TYPES[extension] ?? "text/plain;charset=utf-8";
}

/** The shape the file arrived in, put back when it is written out again. */
export type FileForm = { readonly hadBom: boolean; readonly eol: Eol };

/**
 * A text written out as a file, in the extension the rule chose.
 *
 * Every download of a document in the product ends here - the editor, a
 * comparison, a file a check wrote - so "you get back the format you brought"
 * is one function rather than a habit shared between screens.
 *
 * Two ways out of it, and only one of them assembles anything. `.docx` is a
 * container and is built: the markdown goes to the worker and comes back as
 * bytes. Everything else is already text and is written as it stands, because
 * printing a `.tex` back through a library would hand its author a correct file
 * with a thousand changed lines in it.
 */
export async function saveDocument(input: {
  readonly text: string;
  readonly documentName: string;
  readonly suffix?: string;
  readonly extension: string;
  /** Absent for a text that never came from a file, which has no form to restore. */
  readonly form?: FileForm;
}): Promise<void> {
  const fileName = downloadName(input.documentName, input.suffix ?? "", input.extension);
  const mediaType = mediaTypeFor(input.extension);

  if (input.extension === "docx") {
    const bytes = await assembleDocxFile({ text: input.text });
    download(bytes, fileName, mediaType);
    return;
  }

  download(withFileForm(input.text, input.form), fileName, mediaType);
}

/**
 * The line endings and the byte-order mark put back as the file had them, so
 * that a document nobody edited is handed back as the bytes it arrived as. It
 * is checked by comparing bytes rather than characters: a comparison of
 * characters passes just as happily over a file whose shape has been lost.
 */
export function withFileForm(text: string, form: FileForm | undefined): string {
  if (form === undefined) return text;
  const body = form.eol === "\n" ? text : text.split("\n").join(form.eol);
  return form.hadBom ? `\u{feff}${body}` : body;
}

/**
 * The text of a document as it now stands, in the extension its format earns.
 * It is read from the registry here because that is the only copy of the
 * document there is - there is no file on the disk to go back to.
 */
export async function downloadDocumentText(
  docId: string,
  documentName: string,
  extension: string,
): Promise<boolean> {
  const content = docRegistry.get(docId);
  if (content === undefined) return false;

  await saveDocument({
    text: content.text,
    documentName,
    extension,
    form: { hadBom: content.hadBom, eol: content.eol },
  });
  return true;
}

/**
 * An artifact the server generated - a corrected bibliography, a glossary. It
 * arrives as text in the body, so the file is assembled here and there is no
 * address anywhere from which the contents of a manuscript would come back off
 * a server.
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
