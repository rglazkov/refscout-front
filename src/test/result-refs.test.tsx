// @vitest-environment jsdom
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { useJob } from "@/features/job/use-job";
import { resultKey } from "@/lib/domain";

import { scenarios } from "./msw/handlers.gen";

/**
 * The two answers a result address gives that are not failures of the screen.
 *
 * The body of a module is fetched from an address that arrives with a terminal
 * state, and two things can be true of that address by the time it is used: the
 * module has not finished after all, or a retry has replaced the attempt it
 * belonged to. Neither is something to show a person - both are answered by
 * going back to the poll - and both are invisible on the happy path, which is
 * why they are tested here rather than noticed in production.
 */
const STATUS = scenarios.getJob.finished.body;
const JOB_ID = STATUS.id;
const DOC_ID = STATUS.documents[0]?.docId ?? "";
const REF = `/jobs/${JOB_ID}/documents/${DOC_ID}/modules/bibcheck/result`;

const bibcheck = {
  ...scenarios.getModuleResult.bibcheck.body,
  docId: DOC_ID,
};

/** Only the one module, so the hook asks for exactly one body. */
function statusBody(ref: string) {
  return {
    ...STATUS,
    documents: [
      {
        ...STATUS.documents[0],
        modules: {
          bibcheck: { ...STATUS.documents[0]?.modules.bibcheck, resultRef: ref },
        },
      },
    ],
  };
}

let polls = 0;
/** How many times the address still refuses before it answers. */
let refuseFor = 0;
let refusal: "notReady" | "superseded" = "notReady";
/** The address the poll hands out; a retry mints a new one. */
let currentRef = REF;

const server = setupServer(
  http.get(`*/jobs/${JOB_ID}`, () => {
    polls += 1;
    return HttpResponse.json(statusBody(currentRef));
  }),
  http.get("*/jobs/:jobId/documents/:docId/modules/:moduleId/result", ({ request }) => {
    if (refuseFor > 0) {
      refuseFor -= 1;
      if (refusal === "notReady") {
        return HttpResponse.json(scenarios.getModuleResult.resultNotReady.body, {
          status: 409,
        });
      }
      // A server that says the attempt has been replaced already has the one
      // that replaced it, and hands out its address on the next poll.
      currentRef = `${REF}?attempt=2`;
      return HttpResponse.json(scenarios.getModuleResult.resultSuperseded.body, {
        status: 410,
      });
    }
    return HttpResponse.json({
      ...bibcheck,
      // The second attempt, which is what a retry produces.
      attempt: request.url.includes("attempt=2") ? 2 : 1,
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
  polls = 0;
  refuseFor = 0;
  refusal = "notReady";
  currentRef = REF;
});

afterEach(() => server.resetHandlers());

function mounted() {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  return renderHook(() => useJob({ jobId: JOB_ID, jobToken: "tok" }), {
    wrapper: ({ children }: { readonly children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

describe("a result address fetched too early", () => {
  it("goes back to the poll and the body arrives on the attempt after", async () => {
    refuseFor = 1;
    const { result } = mounted();

    await waitFor(() =>
      expect(result.current.job?.results[resultKey(DOC_ID, "bibcheck")]).toBeDefined(),
    );
    // The poll is what moves the module on, so it is asked again rather than
    // the address being hammered on its own.
    expect(polls).toBeGreaterThan(1);
  });
});

describe("a result address a retry has replaced", () => {
  it("keeps nothing from the attempt that is gone and takes the new address", async () => {
    refusal = "superseded";
    refuseFor = 1;
    const { result } = mounted();

    // The superseded address yields no body at all: showing the previous
    // attempt's findings would be showing an analysis the server has thrown
    // away.
    await waitFor(() => expect(polls).toBeGreaterThan(1));

    // The refreshed state carries the address of the attempt that replaced it,
    // and the body that arrives is that attempt's rather than the dead one's.
    await waitFor(() =>
      expect(result.current.job?.results[resultKey(DOC_ID, "bibcheck")]?.attempt).toBe(2),
    );
  });
});
