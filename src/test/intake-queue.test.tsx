// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIntake } from "@/features/intake/use-intake";
import { docRegistry, releaseAllSourceFiles } from "@/lib/docs";
import { useBufferStore } from "@/stores";

const extract = vi.hoisted(() => vi.fn());
vi.mock("@/workers", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  extract,
}));

beforeEach(() => {
  useBufferStore.setState({ items: [] });
  docRegistry.clear();
  releaseAllSourceFiles();
  extract.mockReset();
});

afterEach(() => {
  cleanup();
});

function bring(name: string, body: string): File {
  return new File([body], name, { type: "text/plain" });
}

describe("intake queue: multiple files dropped together", () => {
  it("all placeholders appear in the buffer immediately upon addFiles", async () => {
    let resolveFirst: ((val: unknown) => void) | undefined;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    extract.mockImplementationOnce(() => firstPromise);
    extract.mockResolvedValue({
      extracted: { text: "Document content", hadBom: false, eol: "\n" },
    });

    const { result } = renderHook(() => useIntake());

    const f1 = bring("doc1.txt", "Content 1");
    const f2 = bring("doc2.txt", "Content 2");
    const f3 = bring("doc3.txt", "Content 3");

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.addFiles([f1, f2, f3]);
    });

    // Immediately after addFiles, all 3 items must be in the buffer store!
    const itemsImmediately = useBufferStore.getState().items;
    expect(itemsImmediately.length).toBe(3);
    expect(itemsImmediately.map((i) => i.name)).toEqual([
      "doc1.txt",
      "doc2.txt",
      "doc3.txt",
    ]);
    expect(itemsImmediately[0]?.extract.state).toBe("extracting");
    expect(itemsImmediately[1]?.extract.state).toBe("reading");
    expect(itemsImmediately[2]?.extract.state).toBe("reading");

    // Now resolve the first parse
    resolveFirst?.({
      extracted: { text: "Doc 1 parsed", hadBom: false, eol: "\n" },
    });

    await act(async () => {
      await addPromise;
    });

    // After all finished, all 3 are in the buffer and ready
    const itemsFinished = useBufferStore.getState().items;
    expect(itemsFinished.length).toBe(3);
    expect(itemsFinished.every((i) => i.extract.state === "ready")).toBe(true);
  });

  it("immediate refusals for unsupported formats do not create placeholders", async () => {
    extract.mockResolvedValue({
      extracted: { text: "Valid content", hadBom: false, eol: "\n" },
    });

    const { result } = renderHook(() => useIntake());

    const f1 = bring("good.txt", "Good file");
    const f2 = bring("bad.xyz", "Bad format file");

    await act(async () => {
      await result.current.addFiles([f1, f2]);
    });

    expect(result.current.refusals.length).toBe(1);
    expect(result.current.refusals[0]?.refusal.code).toBe("UNSUPPORTED_FORMAT");
    expect(useBufferStore.getState().items.map((i) => i.name)).toEqual(["good.txt"]);
  });

  it("cancelling a queued document immediately marks it as cancelled", async () => {
    let resolveFirst: ((val: unknown) => void) | undefined;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    extract.mockImplementationOnce(() => firstPromise);
    extract.mockResolvedValue({
      extracted: { text: "Document content", hadBom: false, eol: "\n" },
    });

    const { result } = renderHook(() => useIntake());

    const f1 = bring("doc1.txt", "Content 1");
    const f2 = bring("doc2.txt", "Content 2");

    let addPromise: Promise<void> | undefined;
    act(() => {
      addPromise = result.current.addFiles([f1, f2]);
    });

    const items = useBufferStore.getState().items;
    expect(items.length).toBe(2);
    const doc2Id = items[1]?.id ?? "";

    // Cancel doc2 while doc1 is still extracting
    act(() => {
      result.current.cancel(doc2Id);
    });

    const doc2Item = useBufferStore.getState().items.find((i) => i.id === doc2Id);
    expect(doc2Item?.extract.state).toBe("failed");
    expect(doc2Item?.extract.errorCode).toBe("CANCELLED");

    // Finish doc1
    resolveFirst?.({
      extracted: { text: "Doc 1 parsed", hadBom: false, eol: "\n" },
    });

    await act(async () => {
      await addPromise;
    });

    // doc1 is ready, doc2 stays cancelled
    const doc1Item = useBufferStore.getState().items.find((i) => i.name === "doc1.txt");
    expect(doc1Item?.extract.state).toBe("ready");
    const finalDoc2 = useBufferStore.getState().items.find((i) => i.id === doc2Id);
    expect(finalDoc2?.extract.state).toBe("failed");
    expect(finalDoc2?.extract.errorCode).toBe("CANCELLED");
  });
});
