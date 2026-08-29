import { afterEach, describe, expect, it } from "vitest";

import {
  clearAllDocuments,
  docRegistry,
  forgetDocument,
  replaceText,
  useAdapter,
  type DocRegistryAdapter,
} from "@/lib/docs";
import { type DocContent } from "@/lib/domain";

/**
 * The text registry (M1.2.2). Four operations and an adapter behind them: in M4
 * the adapter becomes IndexedDB and not one line of calling code changes, which
 * is a claim worth testing now rather than discovering to be false then.
 */
function content(text: string): DocContent {
  return {
    text,
    originalSha256: "0".repeat(64),
    hadBom: false,
    eol: "\n",
    encoding: "utf-8",
  };
}

afterEach(() => {
  clearAllDocuments();
});

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
});

describe("the adapter is the seam M4 swaps", () => {
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
