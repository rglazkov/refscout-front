"use client";

import * as React from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";

import {
  ApiError,
  getJob,
  getModuleResult,
  isTerminal,
  nextPollDelayMs,
} from "@/lib/api";
import {
  type Job,
  type JobStatus,
  type ModuleId,
  type ModuleResult,
  moduleIds,
  resultKey,
} from "@/lib/domain";
import { resolveBody } from "@/lib/anchor";
import { restoredBodies } from "@/lib/boot";
import { writeBody } from "@/lib/storage";
import { reportAnchoring, verifyCounts, verifyWording } from "@/lib/normalize";
import { type JobHandle, useJobStore } from "@/stores";

import { mergeStatuses } from "./merge";

/**
 * The job, as the client assembles it: the polled state, plus the body of every
 * module that has finished.
 *
 * The two are fetched separately on purpose. A dissertation's findings weigh
 * tens of megabytes, and a poll that returned them would re-download the same
 * bodies every few seconds; the poll returns state, and each body is fetched
 * once from the address that came with its terminal state.
 *
 * The results can be the work of several jobs: checks added from the results
 * run as a job of their own. Each job is polled and its bodies are fetched with
 * its own token, and the findings of all of them are put together into one.
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

/**
 * How many times a body is asked for again after the address said the module
 * had not finished. The poll is what actually moves the module on, and this is
 * the wait beside it; past this the body simply arrives with the next terminal
 * state, which brings its own address.
 */
const NOT_READY_RETRIES = 3;

/**
 * The body this document and module already had when the tab started, offered
 * to the query as data it need not fetch. It counts only when the address
 * matches: a retry mints a new one, and its findings are not the findings the
 * previous attempt produced.
 */
function initialBody(entry: Terminal): { readonly initialData?: ModuleResult } {
  const kept = restoredBodies().find(
    (body) =>
      body.docId === entry.docId &&
      body.module === entry.module &&
      body.ref === entry.ref,
  );
  return kept === undefined ? {} : { initialData: kept.body };
}

/** Whether an answer to the poll says this job no longer exists on the server. */
export function jobIsGone(error: unknown): boolean {
  return error instanceof ApiError && error.failure.code === "JOB_NOT_FOUND";
}

/** What the poll's pacing reads from a job's query. */
type PolledQuery = {
  readonly state: {
    readonly error: unknown;
    readonly data: JobStatus | undefined;
    readonly dataUpdateCount: number;
  };
};

/**
 * When a job is asked about next.
 *
 * A job on the server is not for ever, and the answer that says so is not a
 * failure of anything. `404` is read as the end of this job: the asking stops,
 * everything already saved stays where it is, and the screen offers to run the
 * check again. It stays a working screen because the documents, the ticks and
 * the bodies already fetched live in storage and do not belong to the job.
 */
function pollInterval(query: PolledQuery): number | false {
  if (jobIsGone(query.state.error)) return false;
  const state = query.state.data?.state;
  if (state === undefined || isTerminal(state)) return false;
  /*
   * How many answers this job has given, counted by the cache rather than by
   * us. The backoff belongs to the job and not to the tab: a counter of our own
   * would carry on from the previous check, so a second run in the same session
   * would open at the ceiling instead of at a second, and its first result
   * would sit on the server four times longer than the pacing was written for.
   * The job's identifier is part of the key, so a new job is a new count
   * without anything having to reset one.
   */
  return nextPollDelayMs(query.state.dataUpdateCount, {
    hidden: typeof document !== "undefined" && document.visibilityState === "hidden",
    ...(query.state.data?.pollAfterMs === undefined
      ? {}
      : { pollAfterMs: query.state.data.pollAfterMs }),
  });
}

export function useJob(
  handle: JobHandle | null,
  earlier: readonly JobHandle[] = [],
): {
  /** The findings of every job, read as one: what the results screen draws. */
  readonly job: Job | null;
  /**
   * The state of the latest job alone. A run of added checks has its own
   * progress, and it fails or is cancelled on its own while the findings of the
   * jobs before it stay where they are.
   */
  readonly latest: JobStatus | null;
  readonly pending: boolean;
  readonly error: unknown;
  /** The latest job has ended on the server; what is on screen is all there will be. */
  readonly gone: boolean;
} {
  const queryClient = useQueryClient();

  // Oldest first and the latest last, which is the order the results are
  // put together in.
  const handles = React.useMemo(
    () => (handle === null ? earlier : [...earlier, handle]),
    [earlier, handle],
  );

  const statuses = useQueries({
    queries: handles.map((entry) => ({
      queryKey: ["job", entry.jobId],
      // A job whose last known state is final has nothing more to say. A retry
      // of one of its checks gives it a state that is not final again, and the
      // asking resumes.
      enabled: entry.status === undefined || !isTerminal(entry.status.state),
      initialData: entry.status,
      queryFn: () => getJob(entry.jobId, entry.jobToken),
      refetchInterval: pollInterval,
      // A backgrounded tab is the ordinary state on a phone: the poll keeps
      // going, only more slowly.
      refetchIntervalInBackground: true,
    })),
  });

  // What each job's poll has said, named by when it said it: the list of
  // queries is rebuilt on every render, and this is what actually changes.
  const polled = statuses.map((query) => query.dataUpdatedAt).join("|");

  React.useEffect(() => {
    handles.forEach((entry, index) => {
      const data = statuses[index]?.data;
      if (data !== undefined && data !== entry.status) {
        useJobStore.getState().setJobStatus(data);
      }
    });
    // `statuses` is rebuilt on every render and is named by `polled`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handles, polled]);

  const current = handles.map((entry, index) => statuses[index]?.data ?? entry.status);
  const refs = handles.flatMap((entry, index) =>
    terminalRefs(current[index]).map((ref) => ({
      ...ref,
      jobId: entry.jobId,
      token: entry.jobToken,
    })),
  );

  /**
   * Two answers a result address gives that are not failures of the screen, and
   * both are answered by going back to the poll rather than by showing anything.
   *
   * `RESULT_NOT_READY` is the address fetched a moment too early: the module has
   * not finished, so there is nothing to hold yet and the next poll will say so.
   * `RESULT_SUPERSEDED` is the address of an attempt a retry has replaced: what
   * was fetched under it is a previous attempt's findings, and keeping them
   * would leave the screen showing an analysis the server has already thrown
   * away. Both refresh the state of the job the address belongs to, which is
   * where a usable address comes from; the second gives back nothing at all, so
   * the card waits for the new body instead of drawing the old one.
   */
  const fetchBody = React.useCallback(
    async (entry: Terminal & { readonly jobId: string; readonly token: string }) => {
      try {
        const body = await getModuleResult(entry.ref, entry.token);
        // Kept as it arrives, under the address it came from. A dissertation's
        // findings are tens of megabytes, and a reload that fetched them all
        // again would spend somebody's connection on bytes already in hand.
        void writeBody({
          docId: entry.docId,
          module: entry.module,
          ref: entry.ref,
          body,
        });
        return body;
      } catch (error) {
        if (error instanceof ApiError) {
          const { code } = error.failure;
          if (code === "RESULT_NOT_READY" || code === "RESULT_SUPERSEDED") {
            void queryClient.invalidateQueries({ queryKey: ["job", entry.jobId] });
            if (code === "RESULT_SUPERSEDED") return null;
          }
        }
        throw error;
      }
    },
    [queryClient],
  );

  const bodies = useQueries({
    queries: refs.map((entry) => ({
      queryKey: ["job-result", entry.jobId, entry.docId, entry.module, entry.ref],
      queryFn: () => fetchBody(entry),
      /*
       * The body kept from the previous session, if this is the same attempt.
       * Where there is none - the quota refused the write, or a retry has
       * minted a new address - the query fetches it: the same address gives
       * back the same bytes, so a body that did not survive being written is
       * asked for again rather than mourned.
       */
      ...initialBody(entry),
      // Only the one case where waiting is the answer. Everything else is a
      // refusal the screen has to show rather than sit on.
      retry: (failures: number, error: unknown) =>
        failures < NOT_READY_RETRIES &&
        error instanceof ApiError &&
        error.failure.code === "RESULT_NOT_READY",
      // Fetched once per attempt: a retry brings a new ref, and that is a new
      // key, so the previous body is not reused.
      staleTime: Infinity,
      /*
       * A body is held for as long as the screen is showing it and released a
       * few minutes after it stops. A dissertation's findings weigh tens of
       * megabytes, and a retry mints a new address and therefore a new key -
       * so keeping every body for the life of the tab means the superseded
       * ones are never let go of.
       */
      gcTime: 5 * 60_000,
    })),
  });

  /*
   * The assembled job keeps its identity for as long as nothing about it has
   * changed. `refs` and `bodies` are derived afresh on every render, so a job
   * built from them directly would be a new object each time - and everything
   * downstream that watches it, the check below included, would run again on
   * every keystroke elsewhere on the screen. The signature is what actually
   * changed: which bodies were asked for, and which of them have arrived.
   */
  const arrived = refs
    .map((entry, index) => `${entry.ref}:${bodies[index]?.dataUpdatedAt ?? 0}`)
    .join("|");

  const job = React.useMemo<Job | null>(() => {
    const status = mergeStatuses(
      current.filter((known): known is JobStatus => known !== undefined),
    );
    if (status === null) return null;

    const results: Record<string, ModuleResult> = {};
    refs.forEach((entry, index) => {
      const body = bodies[index]?.data;
      // `null` is the superseded address: the body it named belonged to an
      // attempt that no longer exists, and the card waits for the new one.
      if (body === undefined || body === null) return;
      results[resultKey(entry.docId, entry.module)] = body;
    });

    return { status, token: handles.at(-1)?.jobToken ?? "", results };
    // `current`, `refs` and `bodies` are rebuilt on every render and are named
    // by `polled` and `arrived`, which is what the memo is really keyed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handles, polled, arrived]);

  /**
   * The counters come from the poll and the findings come from the body, and
   * the two have to agree. A disagreement is an event with an address rather
   * than a silent recount on the client: recounting would make the screen add
   * up while hiding that the two sides disagree about the same job.
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
        // Whether the offsets in this body were counted over our text, and
        // whether the module's codes and its wording still agree. Both are
        // invisible on the screen and both are reported from here, where a body
        // has just arrived.
        reportAnchoring(body);
        verifyWording(moduleId, body);
        /*
         * And the places are worked out, once per body. It is started here
         * rather than where a card is drawn because it is work rather than a
         * question: a pass over the document in a worker, whose answer arrives
         * later and reaches every screen that shows this finding at once.
         */
        resolveBody(body);
      }
    }
  }, [job]);

  const latestQuery = handle === null ? undefined : statuses.at(-1);
  const latestWasFinal = handle?.status !== undefined && isTerminal(handle.status.state);

  return {
    job,
    latest: handle === null ? null : (current.at(-1) ?? null),
    pending: latestQuery?.isPending ?? false,
    // The end of a job is not an error of the screen, so it is not passed on as
    // one: it has a sentence of its own beside the findings that did arrive.
    error: jobIsGone(latestQuery?.error) ? null : (latestQuery?.error ?? null),
    gone: !latestWasFinal && jobIsGone(latestQuery?.error),
  };
}
