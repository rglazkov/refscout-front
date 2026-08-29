"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { ApiError, NetworkError, submitJob } from "@/lib/api";
import { buildSubmission } from "@/lib/docs";
import { type BufferItem, type CheckOptions } from "@/lib/domain";
import { track } from "@/lib/telemetry";
import { useEntitlementsStore, useJobStore } from "@/stores";

/**
 * Pressing "Run the check" (M1.8.1). The idempotency key is minted here, in the
 * store, and handed to the request - never created inside it. A key born inside
 * the request function is a new key on every retry, so the protection would
 * disappear precisely in the case it exists for; a key in a `useRef` is
 * unmounted along with the component the moment the screen turns to progress
 * (§17).
 */
export type RunFailure = {
  readonly code: string;
  readonly requestId: string;
};

export function useRun(locale: string): {
  readonly run: (items: readonly BufferItem[], options: CheckOptions) => void;
  readonly pending: boolean;
  readonly failure: RunFailure | null;
  readonly dismiss: () => void;
} {
  const [failure, setFailure] = React.useState<RunFailure | null>(null);

  const mutation = useMutation({
    mutationFn: async (input: {
      readonly items: readonly BufferItem[];
      readonly options: CheckOptions;
    }) => {
      const submission = await buildSubmission(input.items, input.options, locale);
      if (submission === null) return null;

      const store = useJobStore.getState();
      // A press whose payload hash matches the standing intention is the same
      // intention and keeps its key; a different hash is a different intention
      // and must get a new one.
      const intent = store.beginIntent(crypto.randomUUID(), submission.payloadHash);

      return submitJob(submission.request, { idempotencyKey: intent.key });
    },
    // Nothing is retried here. The client retries only the case where there was
    // no answer at all, and that lives inside the API client, one layer down,
    // so a retry reuses the same key rather than minting another (M1.8.3).
    retry: false,
    onSuccess: (result) => {
      if (result === null) {
        useJobStore.getState().setInflight(false);
        return;
      }
      // The intention is cleared only once a job exists. Until the answer
      // arrives we do not know whether the request reached the server, and are
      // obliged to repeat with the same key.
      useJobStore.getState().setJob({ jobId: result.jobId, jobToken: result.jobToken });
      useEntitlementsStore.getState().set(result.entitlements);
      useJobStore.getState().clearIntent();
      setFailure(null);
    },
    onError: (error: unknown) => {
      useJobStore.getState().setInflight(false);

      if (error instanceof ApiError) {
        // A reused key with a different body is a report of our own defect, and
        // it is loud: no key rotation, no automatic second attempt. A silent
        // self-correction would create a second job for a body the person may
        // not have meant, and hide the one failure that looks like success.
        track("job_failed", {
          code: error.failure.code === "IDEMPOTENCY_KEY_REUSE" ? "KEY_REUSE" : "TIMEOUT",
        });
        setFailure({ code: error.failure.code, requestId: error.failure.requestId });
        return;
      }
      if (error instanceof NetworkError) {
        track("job_failed", { code: "NETWORK_FAILED" });
        setFailure({ code: "NETWORK_FAILED", requestId: "" });
        return;
      }
      track("job_failed", { code: "TIMEOUT" });
      setFailure({ code: "INTERNAL_ERROR", requestId: "" });
    },
  });

  const run = React.useCallback(
    (items: readonly BufferItem[], options: CheckOptions) => {
      // The double click is stopped by the store's own flag rather than by the
      // mutation's `isPending`: the second press gets in before that updates.
      if (useJobStore.getState().intent?.inflight === true) return;
      mutation.mutate({ items, options });
    },
    [mutation],
  );

  return {
    run,
    pending: mutation.isPending,
    failure,
    dismiss: React.useCallback(() => setFailure(null), []),
  };
}
