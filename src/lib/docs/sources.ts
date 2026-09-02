/**
 * The file behind a document, for as long as the document is in the buffer. Not
 * its bytes: a `File` is a handle the browser keeps against the disk, so
 * holding one costs nothing and reading it again is what makes two ways out of
 * a failed parse possible - "Try again" after a transient failure, and a
 * password typed on the card, which needs the file a second time.
 *
 * It is deliberately not the text registry. That holds the only copy of a
 * document in existence; this holds a reference to something the person still
 * has on their own disk, and it is dropped the moment the card is.
 */
const files = new Map<string, File>();

export function holdSourceFile(docId: string, file: File): void {
  files.set(docId, file);
}

export function sourceFileOf(docId: string): File | undefined {
  return files.get(docId);
}

export function releaseSourceFile(docId: string): void {
  files.delete(docId);
}

export function releaseAllSourceFiles(): void {
  files.clear();
}
