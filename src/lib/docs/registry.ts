import { type DocContent } from "@/lib/domain";

/**
 * The text registry (M1.2.2). Four operations and an adapter behind them; in M4
 * the adapter becomes IndexedDB and not one line of calling code changes.
 *
 * It lives outside React on purpose. Text that has once been in a store will be
 * in the serialised state and in an error report soon after, and the extracted
 * text is the only copy of the document in existence (§17).
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
 * M4 hands it the IndexedDB adapter; the previous one is returned so that a
 * caller which swapped it can put it back without rebuilding it.
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
 * about it. This is what an edit in the editor commits to (M1.5.4): the edit
 * applies to the buffer itself, not to a copy made for viewing, and what leaves
 * for the server is the edited text.
 */
export function replaceText(docId: string, text: string): DocContent | undefined {
  const current = adapter.get(docId);
  if (current === undefined) return undefined;
  const next: DocContent = { ...current, text };
  adapter.put(docId, next);
  return next;
}

/**
 * Removes every document. This is the one operation over the texts that a
 * screen is allowed to ask for, because it destroys rather than reads: "Clear
 * all" and "New check" both mean it, and both ask before they call it (§4, §9).
 */
export function clearAllDocuments(): void {
  adapter.clear();
}

/**
 * Forgets one document. It is called with the removal of the card, because a
 * description leaving the store while its text stays behind is a copy of a
 * manuscript that nothing on screen can reach any more (§4).
 */
export function forgetDocument(docId: string): void {
  adapter.remove(docId);
}
