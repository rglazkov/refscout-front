"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { ApiError, NetworkError, submitJob } from "@/lib/api";
import { buildSubmission, withCompanions } from "@/lib/docs";
import { type BufferItem } from "@/lib/domain";
import { track } from "@/lib/telemetry";
import { useEntitlementsStore, useJobStore } from "@/stores";

/**
 * Pressing "Run the check". The idempotency key is minted here, in the store,
 * and handed to the request - never created inside it. A key born inside the
 * request function is a new key on every retry, so the protection would
 * disappear precisely in the case it exists for; a key in a `useRef` is
 * unmounted along with the component the moment the screen turns to
 * progress.
 */
export type RunFailure = {
  readonly code: string;
  readonly requestId: string;
};

export function useRun(locale: string): {
  readonly run: (items: readonly BufferItem[], buffer: readonly BufferItem[]) => void;
  readonly pending: boolean;
  readonly failure: RunFailure | null;
  readonly dismiss: () => void;
} {
  const [failure, setFailure] = React.useState<RunFailure | null>(null);

  /*
   * The press is latched here and not by the store's flag alone. The flag is
   * raised inside the mutation, after the submission has been assembled - and
   * assembling it reads every text and hashes it, which is asynchronous. Two
   * presses inside that window both got past the flag, and the manuscript went
   * over the connection twice: the server absorbed the second by its key, so
   * nothing looked wrong, and the person had paid for the upload anyway.
   */
  const pressed = React.useRef(false);

  const mutation = useMutation({
    mutationFn: async (input: {
      readonly items: readonly BufferItem[];
      /** The whole buffer, so a companion can be found and sent with them. */
      readonly buffer: readonly BufferItem[];
    }) => {
      const submission = await buildSubmission(
        withCompanions(input.items, input.buffer),
        locale,
      );
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
    // so a retry reuses the same key rather than minting another.
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
    // Whatever happened, the button is a button again.
    onSettled: () => {
      pressed.current = false;
    },
  });

  const run = React.useCallback(
    (items: readonly BufferItem[], buffer: readonly BufferItem[]) => {
      // Neither guard is the mutation's `isPending`: the second press gets in
      // before that updates. The latch answers within the same tick, and the
      // store's flag is what a run already under way is known by.
      if (pressed.current) return;
      if (useJobStore.getState().intent?.inflight === true) return;
      pressed.current = true;
      mutation.mutate({ items, buffer });
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
