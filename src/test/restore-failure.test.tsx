// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useRestoredSession } from "@/lib/boot/use-restored";
import {
  closeDatabase,
  commit,
  readAll,
  resetStorageMode,
  settled,
  storageMode,
} from "@/lib/storage";

/**
 * A stored session this build cannot read.
 *
 * The workspace draws nothing until the previous session has been read back,
 * so a read that throws used to leave the screen empty for good - no drop zone
 * and no word about why. What is held here is the other way round: the screen
 * appears, the tab says it is working in memory, and the stored records stay in
 * the database exactly as they were.
 */

beforeEach(async () => {
  closeDatabase();
  globalThis.indexedDB = new IDBFactory();
  resetStorageMode();
  await settled();
});

describe("a stored session this build cannot read", () => {
  it("still lets the screen appear, in memory, and leaves the records alone", async () => {
    // A card in a shape this build does not know: it has no extraction state,
    // and putting a half-read card to rest reads exactly that.
    const unreadable = {
      key: "card:d1",
      docId: "d1",
      at: Date.now(),
      item: { id: "d1" },
    };
    await commit((stores) => {
      stores.documents.put(unreadable);
    });

    const { result } = renderHook(() => useRestoredSession());

    await waitFor(() => expect(result.current).toBe(true));
    expect(storageMode()).toMatchObject({ durable: false, fault: "absent" });
    expect(await readAll("documents")).toEqual([unreadable]);
  });
});
