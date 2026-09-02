import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ApiError,
  NetworkError,
  fetchVenueRequirements,
  getEntitlements,
  getModuleResult,
  submitJob,
} from "@/lib/api";
import { buildSubmission, docRegistry } from "@/lib/docs";
import { type BufferItem, defaultOptions } from "@/lib/domain";

import { scenarios } from "./msw/handlers.gen";

/**
 * The test of the idempotency key has to break the network.
 *
 * On the happy path the defect is invisible - two clicks make two requests, the
 * person sees one progress screen, and nothing looks wrong. It shows up only
 * where the key exists to work: a retry after a broken connection. So the
 * handler here counts the distinct keys it has seen and fails on the second
 * one, and the connection is broken deliberately.
 */
const seenKeys = new Set<string>();
let posts = 0;
/** How many attempts still fail before the request is allowed through. */
let breakFor = 0;

const server = setupServer(
  http.post("*/jobs", ({ request }) => {
    posts += 1;
    if (breakFor > 0) {
      breakFor -= 1;
      // Not a status: the connection dies, and the client learns nothing about
      // whether the request arrived. That is the one case it may repeat.
      return HttpResponse.error();
    }
    const key = request.headers.get("Idempotency-Key") ?? "";
    seenKeys.add(key);
    if (seenKeys.size > 1) {
      throw new Error(
        `A second idempotency key reached the server: ${[...seenKeys].join(", ")}`,
      );
    }
    return HttpResponse.json(scenarios.submitJob.accepted.body, { status: 202 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  seenKeys.clear();
  posts = 0;
  breakFor = 0;
  docRegistry.clear();
});

function item(id: string, checks: BufferItem["checks"]): BufferItem {
  return {
    id,
    origin: "file",
    name: "paper.tex",
    rawName: "paper.tex",
    sourceSize: 23,
    sourceFormat: "tex",
    detected: "latex",
    checks,
    checksTouched: false,
    role: "manuscript",
    companions: {},
    options: defaultOptions,
    extract: {
      state: "ready",
      chars: 23,
      words: 2,
      edited: false,
      sha256: "0".repeat(64),
    },
    localFindings: [],
  };
}

async function submissionFor(text: string, checks: BufferItem["checks"]) {
  docRegistry.put("doc-1", {
    text,
    originalSha256: "0".repeat(64),
    hadBom: false,
    eol: "\n",
  });
  const built = await buildSubmission([item("doc-1", checks)], "en");
  if (built === null) throw new Error("nothing to submit");
  return built;
}

describe("one key per intention, not per attempt", () => {
  it("two retries after a broken connection give one key and one job", async () => {
    const submission = await submissionFor("\\documentclass{article}", ["presubmit"]);
    // The key is minted once, by the caller, and handed to every attempt.
    const key = crypto.randomUUID();

    breakFor = 2;
    const created = await submitJob(submission.request, { idempotencyKey: key });

    expect(posts).toBe(3);
    expect(seenKeys.size).toBe(1);
    expect(created.jobId).not.toBe("");
  });

  it("a third failure in a row stops rather than retrying forever", async () => {
    const submission = await submissionFor("\\documentclass{article}", ["presubmit"]);
    breakFor = 5;

    await expect(
      submitJob(submission.request, { idempotencyKey: crypto.randomUUID() }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(posts).toBe(3);
  });

  it("two presses with the same buffer are the same intention", async () => {
    // The hash is over the pairs of document and text hash plus the modules and
    // the options, so pressing twice without changing anything is one key.
    const first = await submissionFor("\\documentclass{article}", ["presubmit"]);
    const second = await submissionFor("\\documentclass{article}", ["presubmit"]);
    expect(second.payloadHash).toBe(first.payloadHash);
  });

  it("an edit changes the intention, and so must the key", async () => {
    const before = await submissionFor("\\documentclass{article}", ["presubmit"]);
    const after = await submissionFor("\\documentclass{report}", ["presubmit"]);
    expect(after.payloadHash).not.toBe(before.payloadHash);
  });

  it("removing a tick changes the intention without touching the document hash", async () => {
    // Two hashes, and swapping one for the other looks like an economy and
    // costs either an integrity check or an analysis of the wrong version.
    const both = await submissionFor("\\documentclass{article}", ["presubmit", "cite"]);
    const one = await submissionFor("\\documentclass{article}", ["presubmit"]);

    expect(one.payloadHash).not.toBe(both.payloadHash);
    expect(one.request.documents[0]?.textSha256).toBe(
      both.request.documents[0]?.textSha256,
    );
  });
});

describe("what is never retried", () => {
  it("a request the server cannot absorb twice is not repeated at all", async () => {
    /*
     * "No answer" does not mean "not received": the request may have arrived and
     * the reply been lost. So a repeat is only made where the server can absorb
     * one - a read, a cancellation, or a creation carrying the key that says so.
     * Fetching a venue is none of those: repeating it sends the server after
     * somebody else's page again, on nobody's instruction.
     */
    let attempts = 0;
    server.use(
      http.post("*/venues/fetch", () => {
        attempts += 1;
        return HttpResponse.error();
      }),
    );

    await expect(fetchVenueRequirements("https://example.invalid/cfp")).rejects.toThrow(
      NetworkError,
    );
    expect(attempts).toBe(1);
  });

  it("a read is repeated, because reading twice reads the same thing", async () => {
    let attempts = 0;
    server.use(
      http.get("*/entitlements", () => {
        attempts += 1;
        if (attempts < 3) return HttpResponse.error();
        return HttpResponse.json(scenarios.getEntitlements.paid.body);
      }),
    );

    await expect(getEntitlements()).resolves.toMatchObject({ access: true });
    expect(attempts).toBe(3);
  });

  it("a refusal with a status is not repeated: the server has decided", async () => {
    server.use(
      http.post("*/jobs", () => {
        posts += 1;
        return HttpResponse.json(scenarios.submitJob.keyReuse.body, { status: 422 });
      }),
    );
    const submission = await submissionFor("\\documentclass{article}", ["presubmit"]);

    // A silent self-correction here would create a second job for a body the
    // person may not have meant, and hide the one failure that looks like
    // success. It is loud instead, and it names the request.
    await expect(
      submitJob(submission.request, { idempotencyKey: crypto.randomUUID() }),
    ).rejects.toMatchObject({ failure: { code: "IDEMPOTENCY_KEY_REUSE" } });
    expect(posts).toBe(1);
  });

  it("a cancelled request is not retried, or cancelling stops being cancelling", async () => {
    server.use(
      http.post("*/jobs", async () => {
        posts += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(scenarios.submitJob.accepted.body, { status: 202 });
      }),
    );
    const submission = await submissionFor("\\documentclass{article}", ["presubmit"]);
    const controller = new AbortController();
    const inflight = submitJob(submission.request, {
      idempotencyKey: crypto.randomUUID(),
      signal: controller.signal,
    });
    controller.abort();

    await expect(inflight).rejects.toThrow();
    expect(posts).toBe(1);
  });
});

describe("an address the server hands back is not followed anywhere", () => {
  /*
   * The body of a module is fetched from the address the poll gave us, and the
   * job's token travels with that request. So the address is checked before it
   * is used: a protocol-relative one would be somebody else's host on a
   * deployment whose API is its own origin, and the token would go with it.
   */
  const refused = [
    "//elsewhere.invalid/jobs/1/result",
    "https://elsewhere.invalid/jobs/1/result",
    "/elsewhere/1/result",
    "\\\\elsewhere.invalid\\result",
  ];

  for (const ref of refused) {
    it(`refuses ${ref} without making a request`, async () => {
      let reads = 0;
      server.use(
        http.get("*", () => {
          reads += 1;
          return HttpResponse.json({});
        }),
      );

      await expect(getModuleResult(ref, "token")).rejects.toMatchObject({
        failure: { code: "SCHEMA_INVALID", field: "resultRef" },
      });
      expect(reads).toBe(0);
    });
  }

  it("follows the path the contract describes", async () => {
    const ref = "/jobs/1/documents/2/modules/bibcheck/result";
    let asked = "";
    server.use(
      http.get("*/jobs/:jobId/documents/:docId/modules/:module/result", ({ request }) => {
        asked = new URL(request.url).pathname;
        return HttpResponse.json(scenarios.getModuleResult.bibcheck.body);
      }),
    );

    await getModuleResult(ref, "token");
    expect(asked).toBe(ref);
  });
});

describe("a refusal reaches the person with the request it refused", () => {
  it("carries the code and the request identifier", async () => {
    server.use(
      http.post("*/jobs", () =>
        HttpResponse.json(scenarios.submitJob.docTooLarge.body, { status: 413 }),
      ),
    );
    const submission = await submissionFor("\\documentclass{article}", ["presubmit"]);

    const failure = await submitJob(submission.request, {
      idempotencyKey: crypto.randomUUID(),
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).failure.code).toBe("DOC_TOO_LARGE");
    expect((failure as ApiError).failure.requestId).not.toBe("");
  });
});
