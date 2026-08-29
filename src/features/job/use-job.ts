"use client";

import * as React from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { getJob, getModuleResult, isTerminal, nextPollDelayMs } from "@/lib/api";
import {
  type Job,
  type JobStatus,
  type ModuleId,
  type ModuleResult,
  moduleIds,
  resultKey,
} from "@/lib/domain";
import { verifyCounts } from "@/lib/normalize";
import { type JobHandle } from "@/stores";

/**
 * The job, as the client assembles it: the polled state, plus the body of every
 * module that has finished (§18).
 *
 * The two are fetched separately on purpose. A dissertation's findings weigh
 * tens of megabytes, and a poll that returned them would re-download the same
 * bodies every few seconds; the poll returns state, and each body is fetched
 * once from the address that came with its terminal state (§17).
 */
type Terminal = {
  readonly docId: string;
  readonly module: ModuleId;
  readonly ref: string;
};

function terminalRefs(status: JobStatus | undefined): readonly Terminal[] {
  if (status === undefined) return [];
  const refs: Terminal[] = [];
  for (const document of status.documents) {
    for (const moduleId of moduleIds) {
      const state = document.modules[moduleId];
      if (state?.resultRef === undefined) continue;
      // A body exists only once the module has finished; `skipped` and `error`
      // are finished too, and they carry a verdict worth reading.
      if (state.state === "queued" || state.state === "running") continue;
      refs.push({ docId: document.docId, module: moduleId, ref: state.resultRef });
    }
  }
  return refs;
}

export function useJob(handle: JobHandle | null): {
  readonly job: Job | null;
  readonly pending: boolean;
  readonly error: unknown;
} {
  const attempt = React.useRef(0);

  const status = useQuery({
    queryKey: ["job", handle?.jobId],
    enabled: handle !== null,
    queryFn: () => getJob(handle?.jobId ?? "", handle?.jobToken ?? ""),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      if (state === undefined || isTerminal(state)) return false;
      attempt.current += 1;
      return nextPollDelayMs(attempt.current, {
        hidden: typeof document !== "undefined" && document.visibilityState === "hidden",
        ...(query.state.data?.pollAfterMs === undefined
          ? {}
          : { pollAfterMs: query.state.data.pollAfterMs }),
      });
    },
    // A backgrounded tab is the ordinary state on a phone: the poll keeps
    // going, only more slowly (§17).
    refetchIntervalInBackground: true,
  });

  const refs = terminalRefs(status.data);

  const bodies = useQueries({
    queries: refs.map((entry) => ({
      queryKey: ["job-result", handle?.jobId, entry.docId, entry.module, entry.ref],
      queryFn: () => getModuleResult(entry.ref, handle?.jobToken ?? ""),
      // Fetched once per attempt: a retry brings a new ref, and that is a new
      // key, so the previous body is not reused (M1.8.6).
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });

  const job = buildJob();

  function buildJob(): Job | null {
    if (handle === null || status.data === undefined) return null;

    const results: Record<string, ModuleResult> = {};
    refs.forEach((entry, index) => {
      const body = bodies[index]?.data;
      if (body === undefined) return;
      results[resultKey(entry.docId, entry.module)] = body;
    });

    return { status: status.data, token: handle.jobToken, results };
  }

  /**
   * The counters come from the poll and the findings come from the body, and
   * the two have to agree. A disagreement is an event with an address rather
   * than a silent recount on the client: recounting would make the screen add
   * up while hiding that the two sides disagree about the same job (§18).
   *
   * It runs in an effect and not while the job is being assembled, because it
   * reports - and a report raised during render fires again on every re-render
   * and twice over under StrictMode, which would turn one disagreement into a
   * stream of identical events.
   */
  const checked = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (job === null) return;
    for (const document of job.status.documents) {
      for (const moduleId of moduleIds) {
        const body = job.results[resultKey(document.docId, moduleId)];
        const declared = document.modules[moduleId];
        if (body === undefined || declared === undefined) continue;

        // Once per document, module and attempt: a retry brings a new body and
        // deserves to be checked again, a re-render does not.
        const seen = `${document.docId}:${moduleId}:${body.attempt}`;
        if (checked.current.has(seen)) continue;
        checked.current.add(seen);
        verifyCounts(declared, body);
      }
    }
  }, [job]);

  return { job, pending: status.isPending, error: status.error };
}
