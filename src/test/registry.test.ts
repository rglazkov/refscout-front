import { afterEach, describe, expect, it } from "vitest";

import { placeholderFor } from "@/features/intake/intake";
import {
  clearAllDocuments,
  docRegistry,
  forgetDocument,
  holdSourceFile,
  replaceText,
  setBibEntries,
  sourceFileOf,
  useAdapter,
  type DocRegistryAdapter,
} from "@/lib/docs";
import { type DocContent } from "@/lib/domain";
import { useBufferStore } from "@/stores";

/**
 * The text registry. A handful of operations and an adapter behind them: when the
 * adapter becomes IndexedDB not one line of calling code changes, which is a
 * claim worth testing now rather than discovering to be false then.
 */
function content(text: string): DocContent {
  return {
    text,
    originalSha256: "0".repeat(64),
    hadBom: false,
    eol: "\n",
  };
}

afterEach(() => {
  useBufferStore.setState({ items: [] });
  clearAllDocuments();
});

/** A card with a file behind it, which is what a document in the buffer is. */
function bring(id: string, text: string): void {
  const file = new File([text], `${id}.txt`, { type: "text/plain" });
  useBufferStore.getState().add(placeholderFor(file, id));
  docRegistry.put(id, content(text));
  holdSourceFile(id, file);
}

describe("the registry holds the texts", () => {
  it("puts, gets, forgets one and clears the rest", () => {
    docRegistry.put("a", content("alpha"));
    docRegistry.put("b", content("beta"));
    expect(docRegistry.get("a")?.text).toBe("alpha");

    // Removing a document forgets its text too: a description leaving the store
    // while its text stays behind is a copy nothing can reach.
    forgetDocument("a");
    expect(docRegistry.get("a")).toBeUndefined();
    expect(docRegistry.keys()).toEqual(["b"]);

    clearAllDocuments();
    expect(docRegistry.keys()).toEqual([]);
  });

  it("an edit replaces the text and keeps what extraction learned", () => {
    docRegistry.put("a", { ...content("before"), pages: [{ page: 1, from: 0, to: 6 }] });
    const after = replaceText("a", "after");
    expect(after?.text).toBe("after");
    expect(after?.pages).toEqual([{ page: 1, from: 0, to: 6 }]);
    expect(docRegistry.get("a")?.text).toBe("after");
  });

  it("editing a document that is not there changes nothing", () => {
    expect(replaceText("missing", "text")).toBeUndefined();
  });

  it("the map of a bibliography's entries is replaced whole", () => {
    // It arrives after the text does and again after every edit, so it is set
    // apart from the text rather than written with it.
    docRegistry.put("a", content("@article{one,}"));
    setBibEntries("a", [{ key: "one", from: 0, to: 14 }]);
    expect(docRegistry.get("a")?.bibEntries).toEqual([{ key: "one", from: 0, to: 14 }]);
    expect(docRegistry.get("a")?.text).toBe("@article{one,}");
  });

  it("an empty map is no map, which is a different answer from no entries", () => {
    /*
     * A finding that names an entry key asks whether the entry is known. An
     * empty list answers "there are no entries here", which is what a file with
     * none has - and what a file mid-edit, whose reading has just failed, does
     * not have. Storing nothing is how the second says "we no longer know".
     */
    docRegistry.put("a", content("text"));
    setBibEntries("a", [{ key: "one", from: 0, to: 4 }]);
    setBibEntries("a", []);
    expect(docRegistry.get("a")).not.toHaveProperty("bibEntries");
  });
});

describe("the adapter is the seam a different store is swapped in at", () => {
  it("a different store behind the same four calls needs no caller to change", () => {
    const calls: string[] = [];
    const held = new Map<string, DocContent>();
    const spy: DocRegistryAdapter = {
      get: (docId) => {
        calls.push(`get:${docId}`);
        return held.get(docId);
      },
      put: (docId, value) => {
        calls.push(`put:${docId}`);
        held.set(docId, value);
      },
      remove: (docId) => {
        calls.push(`remove:${docId}`);
        held.delete(docId);
      },
      clear: () => {
        calls.push("clear");
        held.clear();
      },
      keys: () => [...held.keys()],
    };

    const memory = useAdapter(spy);
    docRegistry.put("a", content("alpha"));
    expect(docRegistry.get("a")?.text).toBe("alpha");
    forgetDocument("a");
    expect(calls).toEqual(["put:a", "get:a", "remove:a"]);

    // Put back, so the next test file finds the ordinary adapter.
    useAdapter(memory);
  });
});

/**
 * Where the invariant is enforced, and it matters that the answer is "in one
 * place". Losing the card while the text stays behind leaves a copy of somebody
 * else's manuscript that nothing on screen can reach; losing the file handle
 * leaves a reference to their disk. Both used to depend on the caller
 * remembering, and one caller did not.
 */
describe("removing a document from the buffer is one operation", () => {
  it("takes the card, the text and the handle to the file together", () => {
    bring("a", "alpha");
    bring("b", "beta");

    useBufferStore.getState().remove("a");

    expect(useBufferStore.getState().items.map((item) => item.id)).toEqual(["b"]);
    expect(docRegistry.get("a")).toBeUndefined();
    expect(sourceFileOf("a")).toBeUndefined();
    expect(docRegistry.get("b")?.text).toBe("beta");
    expect(sourceFileOf("b")).toBeDefined();
  });

  it("takes what hung off the document with it", () => {
    bring("host", "manuscript");
    bring("bib", "@article{a}");
    const [, attachment] = useBufferStore.getState().items;
    if (attachment === undefined) throw new Error("the card was not brought in");
    useBufferStore.getState().attach("host", "bibcheck", attachment);

    useBufferStore.getState().remove("host");

    expect(useBufferStore.getState().items).toEqual([]);
    expect(docRegistry.keys()).toEqual([]);
    expect(sourceFileOf("bib")).toBeUndefined();
  });

  it("a document refused after it was read leaves nothing behind", () => {
    // The path that was leaking: the file is held before the parse, and the
    // volume of the text it produced is what refuses it - so the refusal always
    // arrives with a handle already taken.
    bring("big", "a manuscript past the ceiling");
    useBufferStore.getState().remove("big");
    expect(sourceFileOf("big")).toBeUndefined();
  });

  it("emptying the buffer empties the texts and the handles with it", () => {
    bring("a", "alpha");
    bring("b", "beta");

    useBufferStore.getState().clear();

    expect(useBufferStore.getState().items).toEqual([]);
    expect(docRegistry.keys()).toEqual([]);
    expect(sourceFileOf("a")).toBeUndefined();
    expect(sourceFileOf("b")).toBeUndefined();
  });
});
