"use client";

import { manualPlaces, subscribeToManualPlaces } from "@/lib/anchor";
import { observeEdits, observeSnapshots } from "@/lib/docs";
import {
  flushJournals,
  forgetCards,
  writeCards,
  writeDraft,
  writeEdits,
  writeIntent,
  writeJob,
  writeManualPlaces,
  writeMarks,
  writeSnapshot,
  writeView,
} from "@/lib/storage";
import { useBufferStore, useIntakeDraftStore, useJobStore, useUiStore } from "@/stores";

/**
 * What is written, and when.
 *
 * Everything is written as it changes rather than on a timer: the stores are
 * listened to, and a change is a commit. Nothing here waits for the person to
 * stop, and nothing here batches - the records are small, and the whole point
 * of the arrangement is that the gap between "I typed it" and "it is on disk"
 * is the browser's latency and not a number we chose.
 *
 * The one thing deliberately not written on every change is the whole text of a
 * document. That goes down as a journal of transactions, which is what
 * `lib/storage` does behind the registry; here only the descriptions, the marks
 * and the session belong.
 */

let wired = false;

export function watchState(): void {
  if (wired) return;
  wired = true;

  let previous = useBufferStore.getState().items;
  useBufferStore.subscribe((state) => {
    const items = state.items;
    if (items === previous) return;
    const gone = previous
      .filter((item) => !items.some((kept) => kept.id === item.id))
      .map((item) => item.id);
    previous = items;
    void forgetCards(gone);
    void writeCards(items);
  });

  let job = useJobStore.getState();
  useJobStore.subscribe((state) => {
    if (state.job !== job.job) void writeJob(state.job);
    if (state.intent !== job.intent) void writeIntent(state.intent);
    if (
      state.fixed !== job.fixed ||
      state.ignored !== job.ignored ||
      state.accepted !== job.accepted
    ) {
      void writeMarks({
        fixed: state.fixed,
        ignored: state.ignored,
        accepted: state.accepted,
      });
    }
    job = state;
  });

  let draft = useIntakeDraftStore.getState().draft;
  useIntakeDraftStore.subscribe((state) => {
    if (state.draft === draft) return;
    draft = state.draft;
    void writeDraft(draft);
  });

  let collapsed = useUiStore.getState().docListCollapsed;
  useUiStore.subscribe((state) => {
    if (state.docListCollapsed === collapsed) return;
    collapsed = state.docListCollapsed;
    void writeView({ docListCollapsed: collapsed });
  });

  observeSnapshots((docId, snapshot) => {
    void writeSnapshot(
      docId,
      snapshot === null
        ? null
        : {
            textSha256: snapshot.textSha256,
            cpLength: snapshot.cpLength,
            astral: snapshot.astral === null ? null : [...snapshot.astral],
          },
    );
  });

  observeEdits((docId, regions) => {
    void writeEdits(docId, regions);
  });

  subscribeToManualPlaces(() => {
    void writeManualPlaces(manualPlaces());
  });

  watchTheTabGoingAway();
}

/**
 * The tab being put away, which is not the same thing as the tab being closed.
 *
 * Nothing here is about the text: a transaction was written when it was made,
 * and there is no unsaved state to rescue. What is sent on now is what is
 * deferred by its nature - the whole copy of a text whose journal has grown
 * since it was last written, which is cheaper to have on disk than to replay.
 *
 * `visibilitychange` is the important one and `pagehide` is the fallback. A
 * phone putting a tab in the background fires the first, and may kill the tab
 * from there later and without another word.
 *
 * There is no `beforeunload` anywhere in the product. There is nothing to warn
 * about, it cannot wait for an asynchronous write, and it never arrives when a
 * tab is killed in the background. A dialogue that fires every time is a
 * dialogue people learn to dismiss unread, and then it fails in the one case
 * where it would have mattered.
 */
function watchTheTabGoingAway(): void {
  if (typeof document === "undefined") return;
  const away = () => {
    if (document.visibilityState === "hidden") flushJournals();
  };
  document.addEventListener("visibilitychange", away);
  window.addEventListener("pagehide", flushJournals);
}
