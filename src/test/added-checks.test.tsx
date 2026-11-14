// @vitest-environment jsdom
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw/http";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { addableDocuments } from "@/features/job/add-checks";
import { mergeStatuses } from "@/features/job/merge";
import { useJob } from "@/features/job/use-job";
import {
  type BufferItem,
  type Job,
  type JobDocument,
  type JobStatus,
  type ModuleStatus,
  defaultOptions,
  resultKey,
} from "@/lib/domain";
import { useJobStore, type JobHandle } from "@/stores/job";

import { scenarios } from "./msw/handlers.gen";

/**
 * Checks added from the results run as a job of their own, and the person
 * reads the findings of every job together. What is tested here is the promise
 * that makes the feature safe to press: the findings already on screen stay,
 * and the added ones join them.
 */
const STATUS = scenarios.getJob.finished.body;
const DOC_ID = STATUS.documents[0]?.docId ?? "";
const SHA = STATUS.documents[0]?.textSha256 ?? "";

function moduleStatus(jobId: string, module: string): ModuleStatus {
  return {
    state: "ok",
    attempt: 1,
    score: 90,
    counts: { critical: 0, warning: 1, info: 0 },
    resultRef: `/jobs/${jobId}/documents/${DOC_ID}/modules/${module}/result`,
    finishedAt: "2026-11-14T10:00:00Z",
  };
}

function jobStatus(
  id: string,
  modules: Partial<Record<"bibcheck" | "glossary", ModuleStatus>>,
  extra: readonly JobDocument[] = [],
  createdAt = "2026-11-14T09:00:00Z",
): JobStatus {
  const first = STATUS.documents[0] as unknown as JobDocument;
  return {
    ...(STATUS as unknown as JobStatus),
    id,
    createdAt,
    state: "finished",
    documents: [{ ...first, docId: DOC_ID, modules }, ...extra],
  };
}

describe("the results of several jobs read as one", () => {
  it("puts a document's checks from every job on one row", () => {
    const first = jobStatus("job-1", { bibcheck: moduleStatus("job-1", "bibcheck") });
    const second = jobStatus(
      "job-2",
      { glossary: moduleStatus("job-2", "glossary") },
      [],
      "2026-11-14T11:00:00Z",
    );

    const merged = mergeStatuses([first, second]);

    expect(merged?.documents).toHaveLength(1);
    expect(Object.keys(merged?.documents[0]?.modules ?? {}).sort()).toEqual([
      "bibcheck",
      "glossary",
    ]);
    // The latest job is what is under way, and the results began with the first.
    expect(merged?.id).toBe("job-2");
    expect(merged?.createdAt).toBe("2026-11-14T09:00:00Z");
  });

  it("keeps the order the documents first appeared in and adds new ones after", () => {
    const other: JobDocument = {
      ...(STATUS.documents[0] as unknown as JobDocument),
      docId: "doc-new",
      modules: { glossary: moduleStatus("job-2", "glossary") },
    };
    const merged = mergeStatuses([
      jobStatus("job-1", { bibcheck: moduleStatus("job-1", "bibcheck") }),
      jobStatus("job-2", {}, [other]),
    ]);

    expect(merged?.documents.map((document) => document.docId)).toEqual([
      DOC_ID,
      "doc-new",
    ]);
    // A document the later job carried without running anything on it keeps
    // the checks the earlier job ran.
    expect(merged?.documents[0]?.modules.bibcheck).toBeDefined();
  });
});

describe("the store keeps every job of the results", () => {
  beforeEach(() => useJobStore.getState().reset());

  it("moves the job a new one replaces into the earlier jobs", () => {
    const store = useJobStore.getState();
    store.setJob({ jobId: "job-1", jobToken: "t1" });
    store.setJob({ jobId: "job-2", jobToken: "t2" });

    expect(useJobStore.getState().job?.jobId).toBe("job-2");
    expect(useJobStore.getState().earlier.map((job) => job.jobId)).toEqual(["job-1"]);
  });

  it("does not take the same job set again for a second one", () => {
    const store = useJobStore.getState();
    store.setJob({ jobId: "job-1", jobToken: "t1" });
    store.setJob({ jobId: "job-1", jobToken: "t1" });

    expect(useJobStore.getState().earlier).toEqual([]);
  });

  it("writes a polled state onto the job it belongs to", () => {
    const store = useJobStore.getState();
    store.setJob({ jobId: "job-1", jobToken: "t1" });
    store.setJob({ jobId: "job-2", jobToken: "t2" });
    store.setJobStatus(jobStatus("job-1", {}));

    expect(useJobStore.getState().earlier[0]?.status?.id).toBe("job-1");
    expect(useJobStore.getState().job?.status).toBeUndefined();
  });

  it("goes back to the results before a run of added checks that is left", () => {
    const store = useJobStore.getState();
    store.setJob({ jobId: "job-1", jobToken: "t1" });
    store.setJob({ jobId: "job-2", jobToken: "t2" });
    useJobStore.getState().dropLatest();

    expect(useJobStore.getState().job?.jobId).toBe("job-1");
    expect(useJobStore.getState().earlier).toEqual([]);
  });

  it("forgets every job when a new check starts over", () => {
    const store = useJobStore.getState();
    store.setJob({ jobId: "job-1", jobToken: "t1" });
    store.setJob({ jobId: "job-2", jobToken: "t2" });
    useJobStore.getState().reset();

    expect(useJobStore.getState().job).toBeNull();
    expect(useJobStore.getState().earlier).toEqual([]);
  });
});

const server = setupServer(
  http.get("*/jobs/:jobId/documents/:docId/modules/:moduleId/result", ({ params }) =>
    HttpResponse.json({
      ...scenarios.getModuleResult.bibcheck.body,
      docId: DOC_ID,
      module: String(params.moduleId),
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

function mounted(handle: JobHandle, earlier: readonly JobHandle[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  return renderHook(() => useJob(handle, earlier), {
    wrapper: ({ children }: { readonly children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("a job of added checks beside the job before it", () => {
  it("shows the findings of both, and reports the latest job's own state", async () => {
    const first: JobHandle = {
      jobId: "job-1",
      jobToken: "t1",
      status: jobStatus("job-1", { bibcheck: moduleStatus("job-1", "bibcheck") }),
    };
    const second: JobHandle = {
      jobId: "job-2",
      jobToken: "t2",
      status: jobStatus("job-2", { glossary: moduleStatus("job-2", "glossary") }),
    };
    const earlier = [first];
    const { result } = mounted(second, earlier);

    await waitFor(() => {
      expect(result.current.job?.results[resultKey(DOC_ID, "bibcheck")]).toBeDefined();
      expect(result.current.job?.results[resultKey(DOC_ID, "glossary")]).toBeDefined();
    });
    expect(result.current.latest?.id).toBe("job-2");
  });
});

function bufferItem(sha256: string): BufferItem {
  return {
    id: DOC_ID,
    origin: "file",
    name: "thesis.tex",
    rawName: "thesis.tex",
    sourceSize: 40,
    sourceFormat: "tex",
    detected: "latex",
    checks: ["bibcheck"],
    checksTouched: false,
    role: "manuscript",
    companions: {},
    options: defaultOptions,
    extract: { state: "ready", chars: 40, words: 6, edited: false, sha256 },
    localFindings: [],
  };
}

function finishedJob(status: JobStatus): Job {
  return { status, token: "t", results: {} };
}

describe("which checks can be added", () => {
  it("offers every check that has not run on the document", () => {
    const job = finishedJob(
      jobStatus("job-1", { bibcheck: moduleStatus("job-1", "bibcheck") }),
    );
    const [document] = addableDocuments(job, [bufferItem(SHA)]);

    expect(document?.available).toEqual(["glossary", "presubmit", "cite"]);
    expect(document?.edited).toBe(false);
  });

  it("marks a document edited since it was sent", () => {
    const job = finishedJob(
      jobStatus("job-1", { bibcheck: moduleStatus("job-1", "bibcheck") }),
    );
    const [document] = addableDocuments(job, [bufferItem("f".repeat(64))]);

    expect(document?.edited).toBe(true);
  });

  it("leaves out a document every check has already read", () => {
    const all = {
      bibcheck: moduleStatus("job-1", "bibcheck"),
      glossary: moduleStatus("job-1", "glossary"),
      presubmit: moduleStatus("job-1", "presubmit"),
      cite: moduleStatus("job-1", "cite"),
    };
    const job = finishedJob(jobStatus("job-1", all));

    expect(addableDocuments(job, [bufferItem(SHA)])).toEqual([]);
  });
});
