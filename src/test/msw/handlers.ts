import { http, HttpResponse, type DefaultBodyType, type StrictRequest } from "msw";

import { scenarios } from "./handlers.gen";

/**
 * The second data source. Not a development-only version: it is a source that
 * stays in the project for good, and the fast tests and offline work run on it.
 * The application does not know which of the two answered - both go through the
 * same client.
 *
 * Every body here comes from `handlers.gen.ts`, which is generated from the
 * contract, so a mock cannot drift away from what was agreed. What this file
 * adds is the one thing an example cannot express: sequence. A job is created,
 * polled while it runs, and finishes; a key is remembered; a result body is
 * addressed by the document it is about.
 *
 * The ugly cases are here on equal terms with the happy path, because those are
 * the ones screens break on: a module that failed, a job that failed as a whole,
 * a refusal for volume, a reused key, and a read without a job token.
 */
type WireDocument = {
  docId: string;
  name: string;
  role: string;
  checks: string[];
  textSha256: string;
  cpLength: number;
};

type SubmittedJob = {
  readonly jobId: string;
  readonly jobToken: string;
  readonly createdAt: string;
  readonly documents: readonly WireDocument[];
  readonly payload: string;
  polls: number;
  cancelled: boolean;
};

const jobs = new Map<string, SubmittedJob>();
/** One job per idempotency key. The mock is where the second one would appear. */
const byKey = new Map<string, string>();

/** For the tests: nothing carries over from one scenario to the next. */
export function resetMockServer(): void {
  jobs.clear();
  byKey.clear();
}

/** How many polls a job spends running before it finishes. */
const POLLS_BEFORE_DONE = 1;

const FINISHED = scenarios.getJob.finished.body;
const PARTIAL = scenarios.getJob.partial.body;
/**
 * One body per module, each the contract's own. Lending one module's body to
 * another is how a mock starts telling a lie the product then wears: PreSubmit
 * borrowing BibCheck's body borrowed its artifact too, and a checklist was
 * offered - and saved - as a `.bib`.
 */
const RESULTS = {
  bibcheck: scenarios.getModuleResult.bibcheck.body,
  presubmit: scenarios.getModuleResult.presubmit.body,
  glossary: scenarios.getModuleResult.glossary.body,
  cite: scenarios.getModuleResult.cite.body,
} as const;

type ModuleStatus = Record<string, unknown>;

/**
 * A module status, taken from the contract's own example and re-pointed at the
 * document actually submitted. The shape stays the contract's; only the
 * identifiers become the ones this job is about.
 */
function statusFor(jobId: string, document: WireDocument, module: string): ModuleStatus {
  const template =
    (FINISHED.documents[0]?.modules as Record<string, ModuleStatus> | undefined)?.[
      module
    ] ??
    (FINISHED.documents[1]?.modules as Record<string, ModuleStatus> | undefined)?.[
      module
    ] ??
    // Glossary appears in the contract only as a skipped module, which is
    // exactly the verdict worth showing when nothing asked for it.
    (PARTIAL.documents[0]?.modules as Record<string, ModuleStatus> | undefined)
      ?.glossary ??
    {};

  return {
    ...template,
    resultRef: `/jobs/${jobId}/documents/${document.docId}/modules/${module}/result`,
  };
}

function statusBody(job: SubmittedJob, running: boolean) {
  return {
    id: job.jobId,
    createdAt: job.createdAt,
    state: job.cancelled ? "cancelled" : running ? "running" : "finished",
    ...(running ? { pollAfterMs: 0 } : {}),
    stages: [
      {
        id: "accepted",
        labelKey: "stage.accepted",
        labelParams: {
          documents: job.documents.length,
          characters: job.documents.reduce((sum, document) => sum + document.cpLength, 0),
        },
        state: "done",
        startedAt: job.createdAt,
        finishedAt: job.createdAt,
      },
      ...job.documents.flatMap((document) =>
        document.checks.map((module) => ({
          id: `${module}:${document.docId}`,
          labelKey: `stage.${module}`,
          docId: document.docId,
          state: running ? "running" : "done",
          startedAt: job.createdAt,
          ...(running ? {} : { finishedAt: job.createdAt }),
        })),
      ),
    ],
    documents: job.documents.map((document) => ({
      docId: document.docId,
      name: document.name,
      role: document.role,
      textSha256: document.textSha256,
      cpLength: document.cpLength,
      modules: Object.fromEntries(
        document.checks.map((module) => [
          module,
          running
            ? {
                state: "running",
                attempt: 1,
                score: null,
                counts: { critical: 0, warning: 0, info: 0 },
              }
            : statusFor(job.jobId, document, module),
        ]),
      ),
    })),
  };
}

/**
 * The result body of the contract, re-pointed at the document it is about.
 *
 * `texts` is the part that cannot be borrowed from an example. It is the
 * server's own recount of the text it received, and the client compares it with
 * what it sent to decide whether the offsets in the body describe the document
 * on screen at all. An example's hash belongs to the example's manuscript, so a
 * mock that served it would tell every client in every session that its
 * findings were counted over somebody else's text - and the product would
 * always be in the state it is supposed to reach only when something is wrong.
 */
function resultBody(job: SubmittedJob, docId: string, module: string) {
  const template = RESULTS[module as keyof typeof RESULTS] ?? RESULTS.bibcheck;
  const sent = job.documents.find((document) => document.docId === docId);
  return {
    ...template,
    module,
    docId,
    texts: [
      {
        docId,
        textSha256: sent?.textSha256 ?? template.texts[0]?.textSha256,
        cpLength: sent?.cpLength ?? template.texts[0]?.cpLength,
      },
    ],
    issues: template.issues.map((issue) => ({
      ...issue,
      anchors: issue.anchors.map((anchor) =>
        "docId" in anchor ? { ...anchor, docId } : anchor,
      ),
    })),
  };
}

function refusal(status: number, body: object) {
  return HttpResponse.json(body, { status, headers: { "X-Request-Id": "req_mock" } });
}

function tokenOf(request: StrictRequest<DefaultBodyType>): string {
  return request.headers.get("X-Job-Token") ?? "";
}

/**
 * The body of a submission, inflated when it arrived compressed. A real
 * submission is tens of megabytes of text and the client gzips it, so a mock
 * that only knew how to read plain JSON would be a second source that answers
 * everything except the request the product actually makes - and it would fail
 * on exactly the documents worth testing with.
 */
async function submittedBody(
  request: StrictRequest<DefaultBodyType>,
): Promise<{ documents: WireDocument[] }> {
  if (request.headers.get("Content-Encoding") !== "gzip") {
    return (await request.json()) as { documents: WireDocument[] };
  }

  const inflated = new Response(request.body).body?.pipeThrough(
    new DecompressionStream("gzip"),
  );
  const text = await new Response(inflated).text();
  return JSON.parse(text) as { documents: WireDocument[] };
}

export const handlers = [
  http.post("*/jobs", async ({ request }) => {
    const key = request.headers.get("Idempotency-Key") ?? "";
    const body = await submittedBody(request);
    const payload = JSON.stringify(body);

    const known = byKey.get(key);
    if (known !== undefined) {
      const job = jobs.get(known);
      // The same key with a different body is not a scenario but a broken
      // invariant, and it is answered loudly rather than with the old job. A
      // client that quietly got the old job back would be showing an analysis
      // of a version of the manuscript the person no longer has.
      if (job !== undefined && job.payload !== payload) {
        return refusal(422, scenarios.submitJob.keyReuse.body);
      }
      return HttpResponse.json(
        { ...scenarios.submitJob.accepted.body, jobId: known, jobToken: job?.jobToken },
        { status: 200 },
      );
    }

    const jobId = crypto.randomUUID();
    const job: SubmittedJob = {
      jobId,
      jobToken: `tok_${jobId}`,
      createdAt: new Date().toISOString(),
      documents: body.documents.map((document) => ({
        docId: document.docId,
        name: document.name,
        role: document.role,
        checks: document.checks,
        textSha256: document.textSha256,
        cpLength: document.cpLength,
      })),
      payload,
      polls: 0,
      cancelled: false,
    };
    jobs.set(jobId, job);
    if (key !== "") byKey.set(key, jobId);

    return HttpResponse.json(
      {
        ...scenarios.submitJob.accepted.body,
        jobId,
        jobToken: job.jobToken,
        createdAt: job.createdAt,
      },
      { status: 202, headers: { "X-Request-Id": "req_mock" } },
    );
  }),

  http.get("*/jobs/:jobId", ({ params, request }) => {
    const job = jobs.get(String(params.jobId));
    // An unknown job, an erased job and a valid job read without its token are
    // one and the same answer.
    if (job === undefined || tokenOf(request) !== job.jobToken) {
      return refusal(404, scenarios.getJob.jobNotFound.body);
    }
    const running = !job.cancelled && job.polls < POLLS_BEFORE_DONE;
    job.polls += 1;
    return HttpResponse.json(statusBody(job, running), {
      headers: { "X-Request-Id": "req_mock" },
    });
  }),

  http.delete("*/jobs/:jobId", ({ params, request }) => {
    const job = jobs.get(String(params.jobId));
    if (job === undefined || tokenOf(request) !== job.jobToken) {
      return refusal(404, scenarios.getJob.jobNotFound.body);
    }
    job.cancelled = true;
    return HttpResponse.json(statusBody(job, false), { status: 202 });
  }),

  http.get(
    "*/jobs/:jobId/documents/:docId/modules/:moduleId/result",
    ({ params, request }) => {
      const job = jobs.get(String(params.jobId));
      if (job === undefined || tokenOf(request) !== job.jobToken) {
        return refusal(404, scenarios.getJob.jobNotFound.body);
      }
      return HttpResponse.json(
        resultBody(job, String(params.docId), String(params.moduleId)),
        {
          // The body is fetched once per attempt and held by the client; the
          // header is the contract's, and it is here because a mock that
          // answers differently from the stand is a mock that hides a bug.
          headers: { "X-Request-Id": "req_mock", "Cache-Control": "no-store" },
        },
      );
    },
  ),

  http.post("*/jobs/:jobId/modules/:moduleId/retry", ({ params, request }) => {
    const job = jobs.get(String(params.jobId));
    if (job === undefined || tokenOf(request) !== job.jobToken) {
      return refusal(404, scenarios.getJob.jobNotFound.body);
    }
    return HttpResponse.json(statusBody(job, true), { status: 202 });
  }),

  /*
   * A search. The records are the contract's own, and what this adds is the one
   * thing an example cannot express: an answer that depends on the question.
   * A query none of the records match comes back empty, so "nothing found" is a
   * state the product can be walked into rather than one only a test has seen.
   */
  http.post("*/scout/search", async ({ request }) => {
    const body = (await request.json()) as { query?: string };
    const answer = scenarios.scoutSearch.results.body;
    const words = (body.query ?? "")
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2);
    const results = answer.results.filter((record) => {
      const haystack = [record.title, record.venue ?? "", ...record.authors]
        .join(" ")
        .toLowerCase();
      return words.length === 0 || words.some((word) => haystack.includes(word));
    });
    return HttpResponse.json(
      { ...answer, results },
      { headers: { "X-Request-Id": "req_mock" } },
    );
  }),

  // The thumb. It is answered and nothing is kept: the vote is the server's
  // business, and the mock exists to prove the call is made and carries a
  // result identifier rather than a query.
  http.post("*/scout/feedback", () => new HttpResponse(null, { status: 204 })),

  http.post("*/venues/fetch", () =>
    HttpResponse.json(scenarios.fetchVenueRequirements.ready.body),
  ),

  http.get("*/entitlements", () =>
    HttpResponse.json(scenarios.getEntitlements.paid.body),
  ),
];
