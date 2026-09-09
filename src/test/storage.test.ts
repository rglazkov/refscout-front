import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { beforeEach, describe, expect, it } from "vitest";

import {
  abandoned,
  clearStores,
  closeDatabase,
  commit,
  guardWrites,
  hydrate,
  indexedDbDocuments,
  KEEP_DAYS,
  readAll,
  replay,
  resetStorageMode,
  settled,
  storageMode,
  sweep,
  unavailable,
  writeCards,
  writeDraft,
  writeJob,
  writeMarks,
  type DocumentRecord,
  type JournalRecord,
} from "@/lib/storage";
import { type BufferItem, type DocContent, type TextChange } from "@/lib/domain";

/**
 * What the browser keeps between sessions.
 *
 * The extracted text is the only copy of a document there is, so these are not
 * tests of a cache. Each one is a way the work could be lost: a keystroke that
 * never reached the database, a text rebuilt wrongly out of its journal, a
 * schema change that quietly dropped what it could not carry, a quota refusal
 * swallowed in a console.
 */

const content: DocContent = {
  text: "Hello world",
  originalSha256: "abc",
  hadBom: false,
  eol: "\n",
};

function card(id: string): BufferItem {
  return {
    id,
    name: "thesis.tex",
    rawName: "thesis.tex",
    origin: "file",
    sourceSize: 11,
    sourceFormat: "tex",
    detected: "latex",
    checks: [],
    checksTouched: false,
    role: "manuscript",
    companions: {},
    options: {
      bibcheck: {},
      glossary: {},
      presubmit: {},
      cite: {},
    } as unknown as BufferItem["options"],
    extract: { state: "ready", chars: 11, words: 2, edited: false, sha256: "abc" },
    localFindings: [],
  };
}

beforeEach(async () => {
  // A fresh factory per test: a database left behind by the previous one would
  // make the order of the file part of what is being asserted.
  closeDatabase();
  globalThis.indexedDB = new IDBFactory();
  resetStorageMode();
  guardWrites(
    () => true,
    () => {},
  );
  await settled();
});

describe("the document store", () => {
  it("writes the text whole and reads it back", async () => {
    indexedDbDocuments.put("d1", content);
    await settled();

    const restored = await hydrate();
    expect(restored.documents).toHaveLength(1);
    expect(restored.documents[0]?.content.text).toBe("Hello world");
  });

  it("records an edit as a journal entry rather than as the text", async () => {
    indexedDbDocuments.put("d1", content);
    await settled();

    const changes: readonly TextChange[] = [{ from: 5, to: 5, insert: ", brave" }];
    indexedDbDocuments.edit("d1", { ...content, text: "Hello, brave world" }, changes);
    await settled();

    const rows = await readAll("documents");
    const document = rows.find(
      (row) => row.key === "doc:d1",
    ) as unknown as DocumentRecord;
    const journal = rows.filter((row) => row.key.startsWith("log:d1:"));
    // The text on disk is still the one that was written whole: that is the
    // point of the journal, and it is what makes a write per keystroke cheap
    // enough to happen at the moment of the keystroke.
    expect(document.text).toBe("Hello world");
    expect(journal).toHaveLength(1);

    const restored = await hydrate();
    expect(restored.documents[0]?.content.text).toBe("Hello, brave world");
  });

  it("replays several changes of one transaction from the last to the first", () => {
    // Both are measured against the same text, so replaying forwards would
    // leave the second describing positions the first has already moved.
    const changes: readonly TextChange[] = [
      { from: 0, to: 5, insert: "Goodbye" },
      { from: 6, to: 11, insert: "everyone" },
    ];
    const entry = {
      key: "log:d1:1",
      docId: "d1",
      seq: 1,
      revision: 1,
      changes,
      at: 0,
    } as unknown as JournalRecord;
    expect(replay("Hello world", [entry])).toBe("Goodbye everyone");
  });

  it("keeps one long string per document and no second copy of the text", async () => {
    indexedDbDocuments.put("d1", { ...content, meta: { title: "T" } });
    await settled();

    const rows = await readAll("documents");
    const document = rows.find((row) => row.key === "doc:d1") ?? {};
    const long = Object.entries(document).filter(
      ([, value]) => typeof value === "string" && value.length >= content.text.length,
    );
    // The extracted original is a hash and the submission snapshot is a hash
    // and a length. Three copies of a three-million-character manuscript would
    // cost eighteen megabytes where six is enough.
    expect(long.map(([key]) => key)).toEqual(["text"]);
  });

  it("forgets a document with its journal", async () => {
    indexedDbDocuments.put("d1", content);
    indexedDbDocuments.edit("d1", { ...content, text: "Hello!" }, [
      { from: 5, to: 11, insert: "!" },
    ]);
    await settled();

    indexedDbDocuments.remove("d1");
    await settled();

    const rows = await readAll("documents");
    expect(rows.filter((row) => row.key.includes("d1"))).toEqual([]);
  });
});

describe("a slice written whole", () => {
  it("keeps the newest value rather than a queue of stale ones", async () => {
    // Typing into the paste overlay rewrites the whole draft per keystroke. A
    // queue of those would make the window in which work can be lost the
    // latency of twenty commits instead of one, and a reload a moment after the
    // last letter would find whichever of them had got through.
    for (const text of ["a", "a d", "a draft", "a draft that must survive"]) {
      void writeDraft({ text, syntax: "auto" });
    }
    await settled();

    const rows = await readAll("session");
    const drafts = rows.filter((row) => row.key === "draft");
    expect(drafts).toHaveLength(1);
    expect((drafts[0] as unknown as { text: string }).text).toBe(
      "a draft that must survive",
    );
  });

  it("does not collapse the journal, where every record is its own", async () => {
    indexedDbDocuments.put("d1", content);
    let text = content.text;
    for (const insert of ["A", "B", "C"]) {
      const at = text.length;
      text += insert;
      indexedDbDocuments.edit("d1", { ...content, text }, [{ from: at, to: at, insert }]);
    }
    await settled();

    const rows = await readAll("documents");
    expect(rows.filter((row) => row.key.startsWith("log:d1:"))).toHaveLength(3);
    const restored = await hydrate();
    expect(restored.documents[0]?.content.text).toBe("Hello worldABC");
  });
});

describe("the session and the results", () => {
  it("brings back the job, the draft, the marks and the cards", async () => {
    await writeJob({ jobId: "j1", jobToken: "t1" });
    await writeDraft({ text: "half a paragraph", syntax: "latex" });
    await writeMarks({ fixed: { "d1:bibcheck:i1": true }, ignored: {}, accepted: {} });
    await writeCards([card("d1")]);
    await settled();

    const restored = await hydrate();
    expect(restored.job).toMatchObject({ jobId: "j1", jobToken: "t1" });
    expect(restored.draft).toMatchObject({ text: "half a paragraph", syntax: "latex" });
    expect(restored.marks?.fixed).toEqual({ "d1:bibcheck:i1": true });
    expect(restored.cards).toHaveLength(1);
  });

  it("empties every store at once", async () => {
    indexedDbDocuments.put("d1", content);
    await writeJob({ jobId: "j1", jobToken: "t1" });
    await clearStores();

    const restored = await hydrate();
    expect(restored.documents).toEqual([]);
    expect(restored.job).toBeNull();
  });
});

describe("the keeping period", () => {
  const day = 24 * 60 * 60 * 1000;

  it("names what nobody has touched inside the period, and nothing else", () => {
    const now = Date.now();
    const records = [
      { key: "doc:old", docId: "old", at: now - (KEEP_DAYS + 1) * day },
      { key: "doc:fresh", docId: "fresh", at: now - day },
    ] as unknown as DocumentRecord[];
    expect(abandoned(records, now)).toEqual(["old"]);
  });

  it("counts a journal entry as a touch", () => {
    const now = Date.now();
    const records = [
      { key: "doc:d1", docId: "d1", at: now - (KEEP_DAYS + 5) * day },
      { key: "log:d1:000000000001", docId: "d1", at: now - day },
    ] as unknown as DocumentRecord[];
    expect(abandoned(records, now)).toEqual([]);
  });

  it("removes the abandoned document and everything written about it", async () => {
    indexedDbDocuments.put("d1", content);
    await writeCards([card("d1")]);
    await settled();

    await sweep(["d1"], ["bibcheck"]);
    const rows = await readAll("documents");
    expect(rows).toEqual([]);
  });
});

describe("a browser that will not store", () => {
  it("says so instead of throwing, and keeps working", async () => {
    unavailable("quota");
    expect(storageMode()).toMatchObject({ durable: false, fault: "quota" });

    // The write is a no-op rather than a rejection: the refusal is a state of
    // the interface, and an unhandled rejection would be a console message
    // beside a screen that said nothing.
    await expect(commit(() => {})).resolves.toBeUndefined();
  });

  it("refuses to write when this tab does not hold the role, and says so", async () => {
    let refused = false;
    guardWrites(
      () => false,
      () => {
        refused = true;
      },
    );
    indexedDbDocuments.put("d1", content);
    await settled();
    expect(refused).toBe(true);

    const rows = await readAll("documents");
    expect(rows).toEqual([]);
  });
});
