import {
  type Entitlements,
  type JobDocument,
  type JobStage,
  type JobStatus,
  type ModuleId,
  type ModuleStatus,
  type SubmitJobResult,
  type Venue,
  type VenueRequirements,
  moduleIds,
} from "@/lib/domain";
import {
  type Entitlements as WireEntitlements,
  type JobDocument as WireJobDocument,
  type JobStatus as WireJobStatus,
  type ModuleStatus as WireModuleStatus,
  type Stage as WireStage,
  type SubmitJobResponse as WireSubmitJobResponse,
  type VenueFetchResponse as WireVenueFetchResponse,
  type VenuesResponse as WireVenuesResponse,
} from "@/lib/api/wire";

export function toModuleStatus(w: WireModuleStatus): ModuleStatus {
  return {
    state: w.state,
    attempt: w.attempt,
    // Kept as null rather than folded into 0: "checked, and it is bad" and
    // "not checked" are different sentences on the card (§9, M1.1.3).
    score: w.score ?? null,
    counts: {
      critical: w.counts.critical,
      warning: w.counts.warning,
      info: w.counts.info,
    },
    ...(w.headlineKey === undefined ? {} : { headlineKey: w.headlineKey }),
    ...(w.headlineParams === undefined ? {} : { headlineParams: w.headlineParams }),
    ...(w.errorCode === undefined ? {} : { errorCode: w.errorCode }),
    ...(w.skippedReasonKey === undefined ? {} : { skippedReasonKey: w.skippedReasonKey }),
    ...(w.skippedReasonParams === undefined
      ? {}
      : { skippedReasonParams: w.skippedReasonParams }),
    ...(w.resultRef === undefined ? {} : { resultRef: w.resultRef }),
    ...(w.finishedAt === undefined ? {} : { finishedAt: w.finishedAt }),
  };
}

function toStage(w: WireStage): JobStage {
  return {
    id: w.id,
    labelKey: w.labelKey,
    ...(w.labelParams === undefined ? {} : { labelParams: w.labelParams }),
    ...(w.docId === undefined ? {} : { docId: w.docId }),
    state: w.state,
    ...(w.startedAt === undefined ? {} : { startedAt: w.startedAt }),
    ...(w.finishedAt === undefined ? {} : { finishedAt: w.finishedAt }),
    ...(w.progress === undefined ? {} : { progress: w.progress }),
    ...(w.detailKey === undefined ? {} : { detailKey: w.detailKey }),
    ...(w.detailParams === undefined ? {} : { detailParams: w.detailParams }),
  };
}

function toJobDocument(w: WireJobDocument): JobDocument {
  const modules: Partial<Record<ModuleId, ModuleStatus>> = {};
  for (const id of moduleIds) {
    const status = w.modules?.[id];
    if (status !== undefined) modules[id] = toModuleStatus(status);
  }
  return {
    docId: w.docId,
    name: w.name,
    role: w.role,
    textSha256: w.textSha256,
    cpLength: w.cpLength,
    modules,
  };
}

export function toJobStatus(w: WireJobStatus): JobStatus {
  return {
    id: w.id,
    createdAt: w.createdAt,
    state: w.state,
    ...(w.pollAfterMs === undefined ? {} : { pollAfterMs: w.pollAfterMs }),
    stages: (w.stages ?? []).map(toStage),
    documents: (w.documents ?? []).map(toJobDocument),
  };
}

export function toEntitlements(w: WireEntitlements): Entitlements {
  const modules = {} as Record<ModuleId, { allowed: boolean; lockReason?: string }>;
  for (const id of moduleIds) {
    const entry = w.modules[id];
    modules[id] = {
      allowed: entry.allowed,
      ...(entry.lockReason === undefined ? {} : { lockReason: entry.lockReason }),
    };
  }
  return {
    role: w.role,
    access: w.access,
    ...(w.periodEndsAt === undefined ? {} : { periodEndsAt: w.periodEndsAt }),
    modules: modules as Entitlements["modules"],
  };
}

export function toSubmitJobResult(w: WireSubmitJobResponse): SubmitJobResult {
  return {
    jobId: w.jobId,
    jobToken: w.jobToken,
    createdAt: w.createdAt,
    entitlements: toEntitlements(w.entitlements),
  };
}

export function toVenues(w: WireVenuesResponse): readonly Venue[] {
  return w.venues.map((venue) => ({
    id: venue.id,
    name: venue.name,
    ...(venue.publisher === undefined ? {} : { publisher: venue.publisher }),
  }));
}

export function toVenueRequirements(w: WireVenueFetchResponse): VenueRequirements {
  return {
    state: w.state,
    ...(w.text === undefined ? {} : { text: w.text }),
    ...(w.title === undefined ? {} : { title: w.title }),
    fetchedAt: w.fetchedAt,
  };
}
