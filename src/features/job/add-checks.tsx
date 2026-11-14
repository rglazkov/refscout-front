"use client";

import * as React from "react";
import { ChevronDownIcon, PlayIcon, SlidersHorizontalIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import { DocumentIcon } from "@/components/document-icon";
import { Collapse } from "@/components/motion/collapse";
import { BlockedButton } from "@/components/ui/blocked-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { withCompanions } from "@/lib/docs";
import { type BufferItem, type Job, type ModuleId, moduleIds } from "@/lib/domain";
import { useOnline } from "@/lib/offline";
import { CheckToggle } from "@/features/buffer/check-toggle";
import { DocumentSettings } from "@/features/buffer/document-settings";
import { RunFailureNotice } from "@/features/job/run-failure";
import { type RunFailure } from "@/features/job/use-run";
import { hasText, lockOf } from "@/features/plan/compute";
import { useLockPress } from "@/features/plan/use-lock";
import {
  mainItems,
  totalChars,
  useBufferStore,
  useEntitlementsStore,
  useJobStore,
} from "@/stores";

/**
 * A document of the results that can take more checks, and the checks it can
 * take: every check that has not run on it yet.
 */
export type AddableDocument = {
  readonly item: BufferItem;
  readonly available: readonly ModuleId[];
  /**
   * The text has been corrected since it was sent. Its findings point into the
   * text as it was sent, and a check run now would read a different one, so the
   * two sets of places could not both be right: this document takes more checks
   * through a new check instead.
   */
  readonly edited: boolean;
};

/**
 * Which documents can take more checks. A document that every check has
 * already read has nothing to offer and is left out; one whose text was edited
 * after it was sent is listed with the reason it takes no more.
 */
export function addableDocuments(
  job: Job,
  items: readonly BufferItem[],
): readonly AddableDocument[] {
  return mainItems(items).flatMap((item) => {
    if (!hasText(item)) return [];
    const sent = job.status.documents.find((document) => document.docId === item.id);
    const available = moduleIds.filter((module) => sent?.modules[module] === undefined);
    if (available.length === 0) return [];
    const edited = sent !== undefined && sent.textSha256 !== item.extract.sha256;
    return [{ item, available, edited }];
  });
}

/**
 * Adding checks to the results. The chosen checks run as a job of their own on
 * the texts already here, and their findings join the results on screen: what
 * has already been found stays exactly where it is.
 *
 * It is a dialogue because it opens a new stage of work. Grown in place under
 * the header, it would push the findings the person is reading down the page.
 */
export function AddChecksDialog({
  open,
  onOpenChange,
  job,
  pending,
  failure,
  onRun,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly job: Job;
  readonly pending: boolean;
  readonly failure: RunFailure | null;
  readonly onRun: (items: readonly BufferItem[], buffer: readonly BufferItem[]) => void;
}) {
  const t = useTranslations("results.add");
  const jobT = useTranslations("job");
  const offline = useTranslations("workspace.offline");
  const format = useFormatter();
  const connected = useOnline();
  const items = useBufferStore((state) => state.items);
  const documents = addableDocuments(job, items);
  const [chosen, setChosen] = React.useState<
    Readonly<Record<string, readonly ModuleId[]>>
  >({});

  // A fresh choice each time the dialogue opens: what was ticked and not run
  // the last time is not a decision the person has made now.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setChosen({});
  }

  /*
   * The dialogue closes when the job it asked for exists. Closing on the press
   * would hide a refusal - a closed access, a lost connection - that has to be
   * read beside the choice it refused.
   */
  const latestJobId = useJobStore((state) => state.job?.jobId);
  const [openedFor, setOpenedFor] = React.useState(latestJobId);
  if (!open && openedFor !== latestJobId) setOpenedFor(latestJobId);
  React.useEffect(() => {
    if (open && latestJobId !== openedFor) onOpenChange(false);
  }, [latestJobId, onOpenChange, open, openedFor]);

  const selected = documents.flatMap(({ item, edited }) => {
    const checks = edited ? [] : (chosen[item.id] ?? []);
    return checks.length === 0 ? [] : [{ ...item, checks }];
  });
  const count = selected.reduce((total, item) => total + item.checks.length, 0);
  // The companions go with them, so this is the number that leaves.
  const sending = withCompanions(selected, items);

  const toggle = (docId: string, module: ModuleId, checked: boolean) =>
    setChosen((previous) => {
      const current = new Set(previous[docId] ?? []);
      if (checked) current.add(module);
      else current.delete(module);
      return { ...previous, [docId]: moduleIds.filter((id) => current.has(id)) };
    });

  const run = () => {
    /*
     * The added checks are ticked on the document itself before anything is
     * sent. The document's role and the texts its checks read are worked out
     * from its ticks, and the card then says truthfully which checks have been
     * run on it.
     */
    const buffer = useBufferStore.getState();
    for (const item of selected) {
      for (const check of item.checks) buffer.toggleCheck(item.id, check, true);
    }
    const current = useBufferStore.getState().items;
    const outgoing = selected.flatMap((choice) => {
      const item = current.find((candidate) => candidate.id === choice.id);
      return item === undefined ? [] : [{ ...item, checks: choice.checks }];
    });
    onRun(outgoing, current);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="add-checks" className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">{t("title")}</DialogTitle>
          <DialogDescription>{t("lead")}</DialogDescription>
        </DialogHeader>

        <ul className="-mx-1 max-h-[min(60vh,34rem)] space-y-2.5 overflow-y-auto px-1">
          {documents.map((document) => (
            <AddableRow
              key={document.item.id}
              document={document}
              chosen={chosen[document.item.id] ?? []}
              onToggle={(module, checked) => toggle(document.item.id, module, checked)}
            />
          ))}
        </ul>

        {failure === null ? null : <RunFailureNotice failure={failure} />}

        <DialogFooter className="items-stretch sm:items-center sm:justify-between">
          <p
            className="text-[0.8125rem] text-muted-foreground"
            data-testid="add-checks-line"
          >
            <strong className="font-semibold text-foreground">
              {jobT("textToSend", { documents: sending.length })}
            </strong>{" "}
            ·{" "}
            <span className="font-mono">
              {jobT("characters", { chars: format.number(totalChars(sending)) })}
            </span>
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            {count === 0 || !connected ? (
              <BlockedButton
                action="job.add-checks"
                reason={connected ? t("nothingChosen") : offline("runNeedsNetwork")}
                size="sm"
              >
                <PlayIcon aria-hidden="true" />
                {t("run", { count })}
              </BlockedButton>
            ) : (
              <Button
                type="button"
                size="sm"
                data-testid="add-checks-run"
                aria-busy={pending}
                onClick={run}
              >
                <PlayIcon aria-hidden="true" />
                {pending ? jobT("running") : t("run", { count })}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddableRow({
  document,
  chosen,
  onToggle,
}: {
  readonly document: AddableDocument;
  readonly chosen: readonly ModuleId[];
  readonly onToggle: (module: ModuleId, checked: boolean) => void;
}) {
  const t = useTranslations("results.add");
  const bufferT = useTranslations("buffer");
  const entitlements = useEntitlementsStore((state) => state.entitlements);
  const pressLock = useLockPress();
  const [configuring, setConfiguring] = React.useState(false);
  const { item, available, edited } = document;

  return (
    <li
      className="rounded-lg border bg-card p-3"
      data-testid="add-checks-document"
      data-doc-id={item.id}
    >
      <div className="flex items-center gap-2.5">
        <DocumentIcon item={item} size="sm" />
        <span className="min-w-0 flex-1 font-mono text-sm font-medium break-all">
          {item.name}
        </span>
      </div>

      {edited ? (
        <p className="mt-2 text-[0.8125rem] text-muted-foreground">{t("edited")}</p>
      ) : (
        <>
          <div
            role="group"
            aria-label={t("checksFor", { name: item.name })}
            className="mt-2 flex flex-wrap items-center gap-1.5"
          >
            {available.map((module) => (
              <CheckToggle
                key={module}
                module={module}
                documentName={item.name}
                checked={chosen.includes(module)}
                locked={lockOf(entitlements, module).locked}
                onToggle={(checked) => onToggle(module, checked)}
                onLocked={() => pressLock(module)}
              />
            ))}
          </div>

          {/* The settings of the checks chosen here, and the texts they read,
              behind the same disclosure as on the document's card. Only the
              chosen checks appear: the ones already run have their settings
              in the findings they produced. */}
          {chosen.length === 0 ? null : (
            <div className="mt-2">
              <Button
                type="button"
                variant="outlineOnCard"
                size="sm"
                aria-expanded={configuring}
                aria-controls={`add-settings-${item.id}`}
                onClick={() => setConfiguring(!configuring)}
              >
                <SlidersHorizontalIcon aria-hidden="true" />
                {bufferT("configure")}
                <ChevronDownIcon
                  className={cn(
                    "transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                    !configuring && "-rotate-90",
                  )}
                  aria-hidden="true"
                />
              </Button>
              <Collapse open={configuring} id={`add-settings-${item.id}`}>
                <DocumentSettings item={{ ...item, checks: chosen }} />
              </Collapse>
            </div>
          )}
        </>
      )}
    </li>
  );
}
