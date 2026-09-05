"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ColumnsIcon, SearchIcon } from "lucide-react";
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
import { ZoneBoundary } from "@/components/shell/zone-boundary";
import {
  cancelJob,
  getEntitlements,
  isTerminal,
  retryModule,
  startApiSource,
} from "@/lib/api";
import { forgetPlaces } from "@/lib/anchor";
import { type ModuleId } from "@/lib/domain";
import { SessionNotice } from "@/features/auth/session-notice";
import { ReportProblemButton } from "@/features/feedback/report-problem";
import { useSession } from "@/features/auth/use-session";
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

/*
 * The two modes of the working screen, fetched when one is entered. Neither is
 * on the way to a check, and the comparison brings a whole merge editor with
 * it, so nothing of either is downloaded by a person who came to check a
 * manuscript.
 */
const ScoutScreen = dynamic(
  () => import("@/features/scout/scout-screen").then((module) => module.ScoutScreen),
  { ssr: false },
);

const DiffScreen = dynamic(
  () => import("@/features/diff/diff-screen").then((module) => module.DiffScreen),
  { ssr: false },
);

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
  const mode = useUiStore((state) => state.mode);
  const setMode = useUiStore((state) => state.setMode);
  const intake = useIntake();
  const { addFiles } = intake;
  const run = useRun(locale);
  const { job, error: jobError } = useJob(handle);
  const [pasting, setPasting] = React.useState(false);
  const setPasteText = useIntakeDraftStore((state) => state.setText);
  const queries = useQueryClient();
  const setEntitlements = useEntitlementsStore((state) => state.set);

  /*
   * Who is signed in, asked before anything else happens on this screen. The
   * answer carries the CSRF token that every mutating request has to send, so a
   * run pressed before it came back would be refused for a reason the person
   * has no way to act on.
   */
  useSession();

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
  const buffering = handle === null && mode === "buffer";
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
    // The places go with the findings they belonged to: a place kept past the
    // run that produced it points into a document that is no longer here.
    forgetPlaces();
    closeOverlay();
  };

  return (
    <IntakeProvider value={intake}>
      <div
        data-workspace-screen
        data-workspace-state={
          mode !== "buffer"
            ? mode
            : handle === null
              ? documents.length === 0
                ? "empty"
                : "buffer"
              : running
                ? "running"
                : "results"
        }
      >
        {mode === "scout" ? (
          <ZoneBoundary zone="scout">
            <ScoutScreen onBack={() => setMode("buffer")} />
          </ZoneBoundary>
        ) : null}

        {mode === "diff" ? (
          <ZoneBoundary zone="diff">
            <DiffScreen onBack={() => setMode("buffer")} />
          </ZoneBoundary>
        ) : null}

        {mode === "buffer" && handle === null ? (
          <>
            <ZoneBoundary zone="intake">
              <div className="mt-6">
                {/* The two modes stand above the zone while the buffer is
                    empty, and they leave with the same movement the zone
                    shrinks by: once a manuscript is here, a control that
                    replaces the working area reads as a threat to it. Bringing
                    a text in stays inside the zone, where all three ways of
                    doing it live. */}
                <Collapse open={documents.length === 0} id="mode-entries">
                  <div className="mb-2.5 flex gap-2.5 nav:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 nav:flex-none"
                      data-testid="enter-scout"
                      onClick={() => setMode("scout")}
                    >
                      <SearchIcon aria-hidden="true" />
                      {t("modes.scout")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 nav:flex-none"
                      data-testid="enter-diff"
                      onClick={() => setMode("diff")}
                    >
                      <ColumnsIcon aria-hidden="true" />
                      {t("modes.diff")}
                    </Button>
                  </div>
                </Collapse>

                <DropZone
                  onFiles={(files) => void intake.addFiles(files)}
                  onPaste={() => setPasting(true)}
                  refusals={intake.refusals}
                  busy={intake.busy}
                  compact={documents.length > 0}
                />
              </div>
            </ZoneBoundary>

            <Collapse open={documents.length > 0}>
              {/* The list of documents and the button that sends them fail
                  apart from the drop zone above: a card that cannot be drawn
                  must not take away the way to bring the next document in. */}
              <ZoneBoundary zone="buffer">
                <BufferList />
              </ZoneBoundary>
              <ZoneBoundary zone="job">
                <LaunchRow
                  items={items}
                  pending={run.pending}
                  failure={run.failure}
                  onRun={(sending, buffer) => run.run(sending, buffer)}
                />
              </ZoneBoundary>

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

        {/* A session that ended between two polls. It is a line above the work
            rather than a screen in place of it: what is on screen at that
            moment is a check somebody is waiting for, and the findings that
            have already arrived stay readable and exportable. */}
        <SessionNotice error={jobError} />

        {mode === "buffer" && job === null && handle !== null ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("starting")}</p>
        ) : null}

        {mode !== "buffer" || job === null ? null : (
          <div className="mt-6">
            <Collapse open={running}>
              {/* The run and its findings fail apart: the cards that have
                  already arrived stay readable when one of them cannot be
                  drawn, and the progress of the rest keeps running. */}
              <ZoneBoundary zone="job">
                <Progress
                  status={job.status}
                  onCancel={() => cancel.mutate()}
                  cancelling={cancel.isPending}
                />
              </ZoneBoundary>
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
                {/* Back to the buffer, and the offer to tell us about it. The
                    report carries the identifier of the poll that brought the
                    failure, and support finds the case in the logs by it.
                    Nothing here says what the attempt cost: the server counts
                    what was spent and the client is not told. */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={resetJob}>
                    {t("backToBuffer")}
                  </Button>
                  <ReportProblemButton
                    variant="outline"
                    {...(job.status.requestId === undefined
                      ? {}
                      : { requestId: job.status.requestId })}
                  />
                </div>
              </div>
            ) : (
              <ZoneBoundary zone="results">
                <ResultsScreen
                  job={job}
                  running={running}
                  onNewCheck={newCheck}
                  onRetryModule={(docId, module) => retry.mutate({ docId, module })}
                />
              </ZoneBoundary>
            )}
          </div>
        )}

        <PasteOverlay
          open={pasting}
          onClose={() => setPasting(false)}
          onAdd={(text, name, format) => void intake.addText(text, name, format)}
        />
        <TextOverlay results={job?.results ?? {}} />
        <AccessDialog />
      </div>
    </IntakeProvider>
  );
}
