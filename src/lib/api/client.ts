import { type ZodType } from "zod";

import {
  type Entitlements,
  type JobStatus,
  type ModuleId,
  type ModuleResult,
  type SubmitJobRequest,
  type SubmitJobResult,
  type Venue,
  type VenueRequirements,
} from "@/lib/domain";
import { track } from "@/lib/telemetry";

import { ApiError, NetworkError } from "./errors";
import {
  fromSubmitJobRequest,
  toEntitlements,
  toJobStatus,
  toModuleResult,
  toSubmitJobResult,
  toVenueRequirements,
  toVenues,
} from "./mappers";
import {
  zApiError,
  zEntitlements,
  zJobStatus,
  zModuleResult,
  zSubmitJobResponse,
  zVenueFetchResponse,
  zVenuesResponse,
} from "./schemas";

/**
 * The one module in the project that touches the network (§17). Everything it
 * hands outwards is a domain type: the shape of someone else's JSON stops here.
 *
 * Which server answers is a switch rather than a branch in the code (M1.7.6).
 * The mock is not a development-only version - it is a second source that stays
 * in the project, and both of them go through this same file, so no `if` about
 * the data source exists anywhere in the application.
 */
const ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

/** Two, and only for the case where there was no answer at all (M1.8.3). */
const MAX_NETWORK_RETRIES = 2;

let csrfToken: string | null = null;

/** Set from the session answer once sessions exist (M3). */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

type Options = {
  readonly signal?: AbortSignal;
  /**
   * One key per intention, minted by the store and passed in. It is never
   * created here: a key born inside the request function is a new key on every
   * retry, and the protection disappears exactly where it exists to work (§17).
   */
  readonly idempotencyKey?: string;
};

type Requested = {
  readonly path: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly body?: unknown;
  readonly jobToken?: string;
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

  const init: RequestInit = {
    method: requested.method,
    headers,
    // The API lives on another origin, and the session cookie has to travel
    // with the request (§19).
    credentials: "include",
    ...(requested.signal === undefined ? {} : { signal: requested.signal }),
    ...(requested.body === undefined ? {} : { body: JSON.stringify(requested.body) }),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_NETWORK_RETRIES; attempt += 1) {
    try {
      return await fetch(`${ORIGIN}${requested.path}`, init);
    } catch (cause) {
      // A cancelled request is not retried: otherwise cancelling stops being
      // cancelling (M1.8.3).
      if (requested.signal?.aborted === true) throw cause;
      lastError = cause;
    }
  }
  throw new NetworkError(lastError);
}

/**
 * Parses every answer instead of casting it (M1.7.5). Unknown fields are
 * dropped, a missing required one breaks the request loudly and produces a
 * `schema_error` naming the address of the field - which is what nearly every
 * "a null appeared on screen" actually is.
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
    // status the client was not built to expect (§2.8 of the contract).
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
 * The body of one module's work, fetched from the address the poll gave us.
 * `resultRef` is a path on the API origin, and it is used as it was given
 * rather than rebuilt from its parts (§4.4 of the contract).
 */
export async function getModuleResult(
  resultRef: string,
  jobToken: string,
  options: Options = {},
): Promise<ModuleResult> {
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
 * again and no idempotency key takes part (M1.8.6).
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

export async function listVenues(options: Options = {}): Promise<readonly Venue[]> {
  const wire = await call(
    {
      path: "/venues",
      method: "GET",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    zVenuesResponse,
    "listVenues",
  );
  return toVenues(wire);
}

/**
 * The one place where the server goes to the network on our behalf, and there
 * is a reason: a strict `connect-src` names our API alone, and someone else's
 * site sends no CORS headers. Only the address travels, and it is the address
 * the person typed (§4, §19).
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
