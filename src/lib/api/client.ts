import { type ZodType } from "zod";

import {
  type Entitlements,
  type JobStatus,
  type ModuleId,
  type ModuleResult,
  type SubmitJobRequest,
  type SubmitJobResult,
  type VenueRequirements,
} from "@/lib/domain";
import { track } from "@/lib/telemetry";
import { COMPRESS_ABOVE_BYTES, compressBody } from "@/workers";

import { ApiError, NetworkError } from "./errors";
import {
  fromSubmitJobRequest,
  toEntitlements,
  toJobStatus,
  toModuleResult,
  toSubmitJobResult,
  toVenueRequirements,
} from "./mappers";
import {
  zApiError,
  zEntitlements,
  zJobStatus,
  zModuleResult,
  zSubmitJobResponse,
  zVenueFetchResponse,
} from "./schemas";

/**
 * The one module in the project that touches the network. Everything it hands
 * outwards is a domain type: the shape of someone else's JSON stops here.
 *
 * Which server answers is a switch rather than a branch in the code. The mock
 * is not a development-only version - it is a second source that stays in the
 * project, and both of them go through this same file, so no `if` about the
 * data source exists anywhere in the application.
 */
const ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

/** Two, and only for the case where there was no answer at all. */
const MAX_NETWORK_RETRIES = 2;

/**
 * How long the one request carrying the text may take. Fifty documents and
 * twelve million characters over the connection a person actually has is
 * minutes, not seconds, so this is a ceiling on a request that has stopped
 * rather than a limit on one that is working. Everything else answers quickly
 * and gets the shorter figure.
 */
const SUBMIT_TIMEOUT_MS = 10 * 60_000;

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * How long to wait before repeating. Three requests in the same millisecond are
 * not a retry policy: the case being retried is a connection that was not there,
 * and the thing most likely to fix it is a moment passing. The jitter is what
 * stops every tab that lost the same wi-fi from coming back at the same instant.
 */
function backoffMs(attempt: number): number {
  return 300 * 2 ** (attempt - 1) + Math.random() * 200;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let csrfToken: string | null = null;

/** Set from the session answer once sessions exist. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

type Options = {
  readonly signal?: AbortSignal;
  /**
   * One key per intention, minted by the store and passed in. It is never
   * created here: a key born inside the request function is a new key on every
   * retry, and the protection disappears exactly where it exists to work.
   */
  readonly idempotencyKey?: string;
};

type Requested = {
  readonly path: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  readonly jobToken?: string;
  /**
   * Whether this body is compressed before it goes. It is true for exactly one
   * request - the one carrying the documents - because it is the only one big
   * enough for the compression to be worth its own worker.
   */
  readonly compressed?: boolean;
  readonly timeoutMs?: number;
} & Options;

async function send(requested: Requested): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  if (requested.body !== undefined) headers.set("Content-Type", "application/json");
  if (requested.idempotencyKey !== undefined) {
    headers.set("Idempotency-Key", requested.idempotencyKey);
  }
  if (requested.jobToken !== undefined) headers.set("X-Job-Token", requested.jobToken);
  if (csrfToken !== null && requested.method !== "GET") {
    headers.set("X-CSRF-Token", csrfToken);
  }

  // Awaited only when there is something to wait for. A request that needs no
  // compression must leave in the tick it was made in: cancelling it a line
  // later has to cancel a request that is in flight, not prevent one that had
  // not gone yet.
  const prepared = bodyOf(requested, headers);
  const body = prepared instanceof Promise ? await prepared : prepared;

  /*
   * Two clocks, and the request stops on whichever comes first: the caller's
   * cancellation and a ceiling of our own. Without the second, a body that
   * stalls half-sent leaves the screen at "sending" for as long as the tab is
   * open, and on how many megabytes a real connection gives up is a question
   * only a real stand answers.
   */
  const timeout = AbortSignal.timeout(requested.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const signal =
    requested.signal === undefined
      ? timeout
      : AbortSignal.any([requested.signal, timeout]);

  const init: RequestInit = {
    method: requested.method,
    headers,
    // The API lives on another origin, and the session cookie has to travel
    // with the request.
    credentials: "include",
    signal,
    ...(body === undefined ? {} : { body }),
  };

  let lastError: unknown;
  const attempts = repeatable(requested) ? MAX_NETWORK_RETRIES : 0;
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(`${ORIGIN}${requested.path}`, init);
    } catch (cause) {
      // A cancelled request is not retried: otherwise cancelling stops being
      // cancelling. A request that ran out of time is not retried either - the
      // next attempt has the same distance to cover.
      if (signal.aborted) throw cause;
      lastError = cause;
      if (attempt < attempts) await wait(backoffMs(attempt + 1));
    }
  }
  throw new NetworkError(lastError);
}

/**
 * The bytes that go out, and the headers that describe them.
 *
 * `fetch` never compresses an outgoing body, and no request header asks it to,
 * so this is work the client does or it does not happen. It is done in a
 * worker, above roughly sixty-four kilobytes: below that the pass through the
 * compressor costs more than the bytes it saves.
 */
function bodyOf(
  requested: Requested,
  headers: Headers,
): BodyInit | undefined | Promise<BodyInit> {
  if (requested.body === undefined) return undefined;
  const json = JSON.stringify(requested.body);
  /*
   * Below the threshold the JSON goes as it is, and no worker is started - so
   * every request but a real submission leaves in the same tick it was made
   * in. Both forms are valid on this endpoint at any size, so the number is
   * ours alone and the server neither knows it nor depends on it.
   */
  if (requested.compressed !== true || json.length < COMPRESS_ABOVE_BYTES) return json;

  return compressBody(json).then(({ bytes, compressed }) => {
    if (compressed) headers.set("Content-Encoding", "gzip");
    return bytes as BodyInit;
  });
}

/**
 * Whether repeating this request is safe when no answer came back.
 *
 * "No answer" does not mean "not received": the request may have arrived and
 * the reply been lost, so a repeat has to be one the server can absorb twice.
 * A read is; a cancellation is, because cancelling a cancelled job is the same
 * cancellation; and a creation carrying an idempotency key is, because that is
 * exactly what the key is for. Nothing else is - repeating the fetch of a venue
 * would send the server after the same page again, and repeating a module retry
 * would spend a second of the three attempts the server allows without anyone
 * having asked for it.
 */
function repeatable(requested: Requested): boolean {
  if (requested.method === "GET" || requested.method === "DELETE") return true;
  return requested.idempotencyKey !== undefined;
}

/**
 * Parses every answer instead of casting it. Unknown fields are dropped, a
 * missing required one breaks the request loudly and produces a `schema_error`
 * naming the address of the field - which is what nearly every "a null appeared
 * on screen" actually is.
 */
function parse<W>(schema: ZodType<W>, body: unknown, requestId: string, at: string): W {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;

  const field = parsed.error.issues[0]?.path.join(".") ?? "";
  track("schema_error", {
    code: `SCHEMA_MISMATCH:${at}${field === "" ? "" : `.${field}`}`,
  });
  throw new ApiError({
    code: "SCHEMA_INVALID",
    requestId,
    status: 200,
    ...(field === "" ? {} : { field }),
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function call<W>(requested: Requested, schema: ZodType<W>, at: string): Promise<W> {
  const response = await send(requested);
  const requestId = response.headers.get("X-Request-Id") ?? "";
  const body = await readJson(response);

  if (!response.ok) {
    // Every refusal carries the same envelope, so there is one branch for a
    // status the client was not built to expect.
    const failure = zApiError.safeParse(body);
    throw new ApiError(
      failure.success
        ? {
            code: failure.data.error.code,
            requestId: failure.data.error.requestId,
            status: response.status,
            ...(failure.data.error.params === undefined
              ? {}
              : { params: failure.data.error.params }),
            ...(failure.data.error.field === undefined
              ? {}
              : { field: failure.data.error.field }),
            ...(failure.data.error.retryAfterSec === undefined
              ? {}
              : { retryAfterSec: failure.data.error.retryAfterSec }),
          }
        : { code: "INTERNAL_ERROR", requestId, status: response.status },
    );
  }

  return parse(schema, body, requestId, at);
}

export async function submitJob(
  request: SubmitJobRequest,
  options: Options & { readonly idempotencyKey: string },
): Promise<SubmitJobResult> {
  const wire = await call(
    {
      path: "/jobs",
      method: "POST",
      body: fromSubmitJobRequest(request),
      // The one request in the product that carries a manuscript.
      compressed: true,
      timeoutMs: SUBMIT_TIMEOUT_MS,
      idempotencyKey: options.idempotencyKey,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    zSubmitJobResponse,
    "submitJob",
  );
  return toSubmitJobResult(wire);
}

export async function getJob(
  jobId: string,
  jobToken: string,
  options: Options = {},
): Promise<JobStatus> {
  const wire = await call(
    {
      path: `/jobs/${encodeURIComponent(jobId)}`,
      method: "GET",
      jobToken,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    zJobStatus,
    "getJob",
  );
  return toJobStatus(wire);
}

export async function cancelJob(jobId: string, jobToken: string): Promise<JobStatus> {
  const wire = await call(
    { path: `/jobs/${encodeURIComponent(jobId)}`, method: "DELETE", jobToken },
    zJobStatus,
    "cancelJob",
  );
  return toJobStatus(wire);
}

/**
 * Whether an address handed to us by the server is one we may send the job's
 * token to. It has to be a path on the API origin under this job, and nothing
 * else: `//elsewhere/x` is a protocol-relative URL, so on a deployment whose
 * API is its own origin it would be a request to somebody else's host carrying
 * `X-Job-Token` in the headers. The check is here rather than in the schema
 * because this is the module that makes the request.
 */
function isResultPath(resultRef: string): boolean {
  return (
    resultRef.startsWith("/jobs/") &&
    !resultRef.startsWith("//") &&
    !resultRef.includes("\\") &&
    !resultRef.includes("://")
  );
}

/**
 * The body of one module's work, fetched from the address the poll gave us.
 * `resultRef` is a path on the API origin, and it is used as it was given
 * rather than rebuilt from its parts.
 */
export async function getModuleResult(
  resultRef: string,
  jobToken: string,
  options: Options = {},
): Promise<ModuleResult> {
  if (!isResultPath(resultRef)) {
    track("schema_error", { code: "SCHEMA_MISMATCH:getJob.resultRef" });
    throw new ApiError({
      code: "SCHEMA_INVALID",
      requestId: "",
      status: 200,
      field: "resultRef",
    });
  }

  const wire = await call(
    {
      path: resultRef,
      method: "GET",
      jobToken,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    zModuleResult,
    "getModuleResult",
  );
  return toModuleResult(wire);
}

/**
 * A retry is an operation on the job that already exists: the text is not sent
 * again and no idempotency key takes part.
 */
export async function retryModule(
  jobId: string,
  moduleId: ModuleId,
  jobToken: string,
  docIds?: readonly string[],
): Promise<JobStatus> {
  const wire = await call(
    {
      path: `/jobs/${encodeURIComponent(jobId)}/modules/${moduleId}/retry`,
      method: "POST",
      jobToken,
      body: docIds === undefined ? {} : { docIds: [...docIds] },
    },
    zJobStatus,
    "retryModule",
  );
  return toJobStatus(wire);
}

/**
 * The one place where the server goes to the network on our behalf, and there
 * is a reason: a strict `connect-src` names our API alone, and someone else's
 * site sends no CORS headers. Only the address travels, and it is the address
 * the person typed.
 */
export async function fetchVenueRequirements(
  url: string,
  options: Options = {},
): Promise<VenueRequirements> {
  const wire = await call(
    {
      path: "/venues/fetch",
      method: "POST",
      body: { url },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    zVenueFetchResponse,
    "fetchVenueRequirements",
  );
  return toVenueRequirements(wire);
}

export async function getEntitlements(options: Options = {}): Promise<Entitlements> {
  const wire = await call(
    {
      path: "/entitlements",
      method: "GET",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    zEntitlements,
    "getEntitlements",
  );
  return toEntitlements(wire);
}
