import { type BibSpan, type DocContent } from "@/lib/domain";

import { clearEdits, forgetEdits } from "./edits";
import { clearSnapshots, forgetSnapshot } from "./snapshot";
import { releaseAllSourceFiles, releaseSourceFile } from "./sources";

/**
 * The text registry. A handful of operations and an adapter behind them; when the
 * adapter becomes IndexedDB not one line of calling code changes.
 *
 * It lives outside React on purpose. Text that has once been in a store will be
 * in the serialised state and in an error report soon after, and the extracted
 * text is the only copy of the document in existence.
 */
export type DocRegistryAdapter = {
  readonly get: (docId: string) => DocContent | undefined;
  readonly put: (docId: string, content: DocContent) => void;
  readonly remove: (docId: string) => void;
  readonly clear: () => void;
  readonly keys: () => readonly string[];
};

function memoryAdapter(): DocRegistryAdapter {
  const contents = new Map<string, DocContent>();
  return {
    get: (docId) => contents.get(docId),
    put: (docId, content) => void contents.set(docId, content),
    remove: (docId) => void contents.delete(docId),
    clear: () => contents.clear(),
    keys: () => [...contents.keys()],
  };
}

let adapter: DocRegistryAdapter = memoryAdapter();

/**
 * Replaces the store behind the registry, and gives back the one it replaced.
 * This is how the IndexedDB adapter is handed in; the previous one is returned
 * so that a caller which swapped it can put it back without rebuilding it.
 */
export function useAdapter(next: DocRegistryAdapter): DocRegistryAdapter {
  const previous = adapter;
  adapter = next;
  return previous;
}

export const docRegistry = {
  get: (docId: string): DocContent | undefined => adapter.get(docId),
  put: (docId: string, content: DocContent): void => adapter.put(docId, content),
  remove: (docId: string): void => adapter.remove(docId),
  clear: (): void => adapter.clear(),
  keys: (): readonly string[] => adapter.keys(),
} as const;

/**
 * Replaces the text of a document, keeping everything the extraction learned
 * about it. This is what an edit in the editor commits to: the edit applies to
 * the buffer itself, not to a copy made for viewing, and what leaves for the
 * server is the edited text.
 */
export function replaceText(docId: string, text: string): DocContent | undefined {
  const current = adapter.get(docId);
  if (current === undefined) return undefined;
  const next: DocContent = { ...current, text };
  adapter.put(docId, next);
  return next;
}

/**
 * Replaces the map of where a bibliography's entries sit. It arrives after the
 * text does - the reading is a second pass, and after an edit it is a second
 * pass over a text that has already been written back - so it is set apart from
 * the text rather than with it.
 *
 * An empty map is stored as no map at all. The difference matters: a finding
 * that names an entry key asks whether the entry is known, and an empty list
 * answers "no entries here", which is exactly what a file with none has.
 */
export function setBibEntries(docId: string, bibEntries: readonly BibSpan[]): void {
  const current = adapter.get(docId);
  if (current === undefined) return;
  const { bibEntries: _previous, ...rest } = current;
  adapter.put(docId, bibEntries.length === 0 ? rest : { ...rest, bibEntries });
}

/**
 * Removes every document. This is the one operation over the texts that a
 * screen is allowed to ask for, because it destroys rather than reads: "Clear
 * all" and "New check" both mean it, and both ask before they call it.
 */
export function clearAllDocuments(): void {
  adapter.clear();
  releaseAllSourceFiles();
  // What was sent goes with what was kept: a snapshot outliving its document
  // describes a text nothing on screen can reach any more, and so does a record
  // of what was typed into it.
  clearSnapshots();
  clearEdits();
}

/**
 * Forgets one document. It is called with the removal of the card, because a
 * description leaving the store while its text stays behind is a copy of a
 * manuscript that nothing on screen can reach any more.
 */
export function forgetDocument(docId: string): void {
  adapter.remove(docId);
  // The handle to the file on disk goes with the text. Kept, it would be a
  // reference to somebody's manuscript that no card can reach any more.
  releaseSourceFile(docId);
  forgetSnapshot(docId);
  forgetEdits(docId);
}
