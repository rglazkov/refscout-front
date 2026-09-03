import { type VenueRef } from "./document";
import { type CheckOptions } from "./options";
import {
  type Counts,
  type DocRole,
  type JobState,
  type LockReason,
  type ModuleId,
  type ModuleRunState,
  type SourceFormat,
  type StageState,
} from "./ids";
import { type Artifact, type ModuleResult, type Params } from "./issue";

/**
 * What a poll returns: state, and never result bodies. A dissertation's
 * findings weigh tens of megabytes, and a full answer on every tick would
 * re-download them in a circle.
 */
export type ModuleStatus = {
  readonly state: ModuleRunState;
  /** 1 on the first run, raised by a retry. */
  readonly attempt: number;
  /**
   * `null` for Cite, which has no score at all, and for a module that did not
   * run. Without it the results screen cannot tell "checked, and it is bad"
   * from "not checked", which are different sentences and different actions for
   * the reader.
   */
  readonly score: number | null;
  /**
   * The only source of the numbers on screen. These and the findings in the
   * body have to agree, and a disagreement is reported rather than quietly
   * recounted.
   */
  readonly counts: Counts;
  readonly headlineKey?: string;
  readonly headlineParams?: Params;
  readonly errorCode?: string;
  readonly skippedReasonKey?: string;
  readonly skippedReasonParams?: Params;
  /** The address of the result body; it appears together with a terminal state. */
  readonly resultRef?: string;
  readonly finishedAt?: string;
};

export type JobStage = {
  readonly id: string;
  readonly labelKey: string;
  readonly labelParams?: Params;
  readonly docId?: string;
  readonly state: StageState;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly progress?: { readonly done: number; readonly total: number };
  readonly detailKey?: string;
  readonly detailParams?: Params;
};

export type JobDocument = {
  readonly docId: string;
  readonly name: string;
  readonly role: DocRole;
  readonly textSha256: string;
  readonly cpLength: number;
  readonly modules: Readonly<Partial<Record<ModuleId, ModuleStatus>>>;
};

export type JobStatus = {
  readonly id: string;
  readonly createdAt: string;
  readonly state: JobState;
  /** Advisory: wait at least this long before polling again, on top of our backoff. */
  readonly pollAfterMs?: number;
  readonly stages: readonly JobStage[];
  readonly documents: readonly JobDocument[];
  /**
   * The identifier of the poll that brought this state. It is not part of the
   * body - it is the header every answer carries - and it is kept because a job
   * that failed is a case somebody writes to support about, and this is the
   * line support finds it by in the server's own log.
   */
  readonly requestId?: string;
};

/** The key of one result body: the document and the module together. */
export type ResultKey = `${string}:${ModuleId}`;

export function resultKey(docId: string, module: ModuleId): ResultKey {
  return `${docId}:${module}`;
}

/**
 * The job as the client assembles it: the polled state plus the bodies fetched
 * for the modules that have finished. It does not exist on the wire.
 */
export type Job = {
  readonly status: JobStatus;
  readonly token: string;
  readonly results: Readonly<Record<string, ModuleResult>>;
};

/**
 * The intention to run a check - not the request that carries it out. One key
 * per press of the button, not per attempt, which is the whole point: a double
 * click and a retry after a broken connection are one intention.
 */
export type RunIntent = {
  readonly key: string;
  /**
   * SHA-256 of a short string of docId:textSha256 pairs plus the modules and
   * options. Not the same hash as `textSha256`: that one is about one document
   * and travels to the server, this one is about the whole submission and
   * travels nowhere.
   */
  readonly payloadHash: string;
  /** Guards the double click: the mutation's `isPending` updates too late. */
  readonly inflight: boolean;
};

export type ModuleEntitlement = {
  readonly allowed: boolean;
  readonly lockReason?: LockReason;
};

/**
 * Two independent answers. Whether a module is allowed is not derived from
 * whether access is open: a trial run carries `allowed: true` together with
 * `access: false`.
 */
export type Entitlements = {
  readonly role: "anonymous" | "free" | "paid";
  readonly access: boolean;
  readonly periodEndsAt?: string;
  readonly modules: Readonly<Record<ModuleId, ModuleEntitlement>>;
};

export type VenueRequirements = {
  readonly state: "ready" | "not-requirements";
  readonly text?: string;
  readonly title?: string;
  readonly fetchedAt: string;
};

/** One document as it goes out. The only thing that leaves is text. */
export type SubmitDocument = {
  readonly docId: string;
  readonly name: string;
  readonly role: DocRole;
  readonly format: SourceFormat;
  readonly checks: readonly ModuleId[];
  /**
   * The other documents this one's checks read. Empty `checks` and a place in
   * somebody's `uses` is how a companion travels.
   */
  readonly uses?: readonly string[];
  /** The settings for this document's checks. They belong to it, not to the job. */
  readonly options: CheckOptions;
  readonly text: string;
  /** SHA-256 of the UTF-8 bytes of `text`; the server recomputes it. */
  readonly textSha256: string;
  readonly cpLength: number;
  readonly venue?: VenueRef;
  readonly meta?: Readonly<Record<string, string>>;
};

/**
 * The body of the job request. The idempotency key is not a field of it: it is
 * about delivery rather than content, and travels as a header.
 */
export type SubmitJobRequest = {
  readonly documents: readonly SubmitDocument[];
  readonly locale: string;
};

export type SubmitJobResult = {
  readonly jobId: string;
  readonly jobToken: string;
  readonly createdAt: string;
  readonly entitlements: Entitlements;
};

export type { Artifact, ModuleResult };
