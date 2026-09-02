"use client";

import * as React from "react";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/motion/collapse";
import { MotionProvider } from "@/components/motion/motion-provider";
import {
  cancelJob,
  getEntitlements,
  isTerminal,
  retryModule,
  startApiSource,
} from "@/lib/api";
import { type ModuleId } from "@/lib/domain";
import { TextOverlay } from "@/features/editor/text-overlay";
import { DropZone } from "@/features/intake/drop-zone";
import { IntakeProvider } from "@/features/intake/intake-context";
import { PasteOverlay } from "@/features/intake/paste-overlay";
import { useIntake } from "@/features/intake/use-intake";
import { Progress } from "@/features/job/progress";
import { LaunchRow } from "@/features/job/launch-row";
import { useJob } from "@/features/job/use-job";
import { useRun } from "@/features/job/use-run";
import { AccessDialog } from "@/features/plan/access-dialog";
import { ResultsScreen } from "@/features/results/results-screen";
import {
  mainItems,
  useBufferStore,
  useEntitlementsStore,
  useIntakeDraftStore,
  useJobStore,
  useUiStore,
} from "@/stores";

import { BufferList } from "./buffer-list";

/**
 * The working screen. Four zones from top to bottom in the order the person
 * acts in - intake, buffer, plan, run - and they do not replace one another:
 * the drop zone stays on screen while the buffer fills, and the list stays
 * where it is when the next document is added.
 *
 * The whole of the working area is replaced by exactly one thing: a run that
 * is under way, which then becomes the results without the screen being
 * rebuilt.
 */
export default function Workspace() {
  // One client for the tab. Server state belongs to Query and browser state to
  // Zustand, and the boundary is not negotiable.
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // A refusal carrying an HTTP status is never repeated: the server
            // has made its decision and repeating will not change it.
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // The data source is started before the screen is drawn. A request that left
  // before the mock was intercepting would go to the real address.
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    void startApiSource().then(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={client}>
      <MotionProvider>
        <WorkspaceBody />
      </MotionProvider>
    </QueryClientProvider>
  );
}

function WorkspaceBody() {
  const t = useTranslations("workspace");
  const locale = useLocale();
  const items = useBufferStore((state) => state.items);
  // The screen is empty or not by the documents in it. What hangs off a
  // document is on that document's card and never on its own.
  const documents = mainItems(items);
  const clearBuffer = useBufferStore((state) => state.clear);
  const handle = useJobStore((state) => state.job);
  const resetJob = useJobStore((state) => state.reset);
  const closeOverlay = useUiStore((state) => state.closeOverlay);
  const intake = useIntake();
  const { addFiles } = intake;
  const run = useRun(locale);
  const { job } = useJob(handle);
  const [pasting, setPasting] = React.useState(false);
  const setPasteText = useIntakeDraftStore((state) => state.setText);
  const queries = useQueryClient();
  const setEntitlements = useEntitlementsStore((state) => state.set);

  const entitlementQuery = useQuery({
    queryKey: ["entitlements"],
    queryFn: ({ signal }) => getEntitlements({ signal }),
    staleTime: 60_000,
  });
  React.useEffect(() => {
    if (entitlementQuery.data !== undefined) setEntitlements(entitlementQuery.data);
  }, [entitlementQuery.data, setEntitlements]);

  // Pasting adds a document to the buffer, and the buffer is on screen only
  // while there is no job. Left listening, Ctrl+V on the progress or the
  // results opens the paste overlay and files the text into a list nobody can
  // see.
  const buffering = handle === null;
  React.useEffect(() => {
    if (!buffering) return;
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, [role='textbox']") !== null)
      ) {
        return;
      }

      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length > 0) {
        event.preventDefault();
        void addFiles(files);
        return;
      }

      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (text === "") return;
      event.preventDefault();
      setPasteText(text);
      setPasting(true);
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addFiles, buffering, setPasteText]);

  const running = job !== null && !isTerminal(job.status.state);

  const cancel = useMutation({
    mutationFn: () => cancelJob(handle?.jobId ?? "", handle?.jobToken ?? ""),
    onSuccess: () => {
      // Cancelling returns the person to the buffer with its contents intact:
      // there is no result yet, so there is nothing to send again.
      resetJob();
    },
  });

  // A failed module is re-run inside the job that already exists: the text is
  // not sent again, and no new job is created from this screen.
  const retry = useMutation({
    // Named down to the document. Omitting the document means every document
    // where the module failed, and a buffer of five manuscripts with one broken
    // check would re-run four that are already finished.
    mutationFn: (input: { readonly docId: string; readonly module: ModuleId }) =>
      retryModule(handle?.jobId ?? "", input.module, handle?.jobToken ?? "", [
        input.docId,
      ]),
    onSuccess: () => queries.invalidateQueries({ queryKey: ["job", handle?.jobId] }),
  });

  const newCheck = () => {
    clearBuffer();
    resetJob();
    closeOverlay();
  };

  return (
    <IntakeProvider value={intake}>
      <div
        data-workspace-screen
        data-workspace-state={
          handle === null
            ? documents.length === 0
              ? "empty"
              : "buffer"
            : running
              ? "running"
              : "results"
        }
      >
        {handle === null ? (
          <>
            <div className="mt-6">
              <DropZone
                onFiles={(files) => void intake.addFiles(files)}
                onPaste={() => setPasting(true)}
                refusals={intake.refusals}
                busy={intake.busy}
                compact={documents.length > 0}
              />
            </div>

            <Collapse open={documents.length > 0}>
              <BufferList />
              <LaunchRow
                items={items}
                pending={run.pending}
                failure={run.failure}
                onRun={(sending, buffer) => run.run(sending, buffer)}
              />

              {/* Said plainly, because it is true today: the buffer lives as
                  long as the tab does. Storage that survives a reload is not
                  built yet, and until it exists the honest sentence is the
                  feature. */}
              <p
                className="mt-3 text-xs text-muted-foreground"
                data-testid="volatile-notice"
              >
                {t("reloadLoses")}
              </p>
            </Collapse>
          </>
        ) : null}

        {job === null && handle !== null ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("starting")}</p>
        ) : null}

        {job === null ? null : (
          <div className="mt-6">
            <Collapse open={running}>
              <Progress
                status={job.status}
                onCancel={() => cancel.mutate()}
                cancelling={cancel.isPending}
              />
            </Collapse>

            {job.status.state === "failed" ? (
              /* A job that failed as a whole gets its own screen: the code, the
                 request identifier, and a buffer that is still intact. "Run
                 again" makes a new job with a new key - the old one is dead and
                 there is nothing to repeat under its key. */
              <div
                role="alert"
                data-testid="job-failed"
                className="rounded-xl border border-critical-border bg-critical-soft p-4"
              >
                <p className="font-medium text-critical">{t("failedTitle")}</p>
                <p className="mt-1 text-sm">
                  {t("failedBody", { jobId: job.status.id })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={resetJob}
                >
                  {t("backToBuffer")}
                </Button>
              </div>
            ) : (
              <ResultsScreen
                job={job}
                running={running}
                onNewCheck={newCheck}
                onRetryModule={(docId, module) => retry.mutate({ docId, module })}
              />
            )}
          </div>
        )}

        <PasteOverlay
          open={pasting}
          onClose={() => setPasting(false)}
          onAdd={(text, name, format) => void intake.addText(text, name, format)}
        />
        <TextOverlay />
        <AccessDialog />
      </div>
    </IntakeProvider>
  );
}
