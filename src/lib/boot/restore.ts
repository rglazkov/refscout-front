"use client";

import {
  type BufferItem,
  type DocContent,
  type ModuleId,
  moduleIds,
  resultKey,
} from "@/lib/domain";
import {
  hydrate,
  indexedDbDocuments,
  seedDocuments,
  sweep,
  type StoredBody,
} from "@/lib/storage";
import { restoreEdits, restoreSnapshot, installAdapter } from "@/lib/docs";
import { restoreManualPlaces } from "@/lib/anchor";
import { useBufferStore, useIntakeDraftStore, useJobStore, useUiStore } from "@/stores";

/**
 * Putting the work back where it was.
 *
 * There is one way in and this is it. It makes no difference what the return
 * was - a reload, a tab the browser restored, the way back from an external
 * sign-in page, the way back from the payment provider - all of them are the
 * same start, and all of them find the buffer, the ticks, the plan, the draft,
 * the intention behind the run and the findings already received. The address
 * bar holds none of it: what is read is the database, never the link.
 */

/** The bodies that came out of storage, given to the poll as it starts. */
let bodies: readonly StoredBody[] = [];

export function restoredBodies(): readonly StoredBody[] {
  return bodies;
}

/** Once per tab: a second run would put a stale copy over live work. */
let done: Promise<void> | null = null;

export function restoreSession(): Promise<void> {
  done ??= run();
  return done;
}

async function run(): Promise<void> {
  installAdapter(indexedDbDocuments);

  const restored = await hydrate();

  const contents = new Map<
    string,
    {
      readonly content: DocContent;
      readonly head: { revision: number; seq: number; chars: number; entries: number };
    }
  >();
  for (const document of restored.documents) {
    contents.set(document.docId, { content: document.content, head: document.head });
  }
  seedDocuments(contents);

  // What nobody has touched inside the keeping period goes now, before any of
  // it is drawn: a card removed a moment after it appeared reads as a fault.
  void sweep(restored.stale, moduleIds);

  const items = restored.cards.filter(
    (item): item is BufferItem => item !== null && typeof item === "object",
  );
  useBufferStore.setState({ items: items.map(settle) });

  for (const [docId, snapshot] of restored.snapshots) {
    restoreSnapshot(docId, {
      textSha256: snapshot.textSha256,
      cpLength: snapshot.cpLength,
      astral: snapshot.astral === null ? null : Uint32Array.from(snapshot.astral),
    });
  }
  for (const [docId, regions] of restored.edits) restoreEdits(docId, regions);
  restoreManualPlaces(restored.manual);

  if (restored.draft !== null) {
    useIntakeDraftStore.setState({ draft: restored.draft });
  }
  if (restored.view !== null) {
    useUiStore.setState({ docListCollapsed: restored.view.docListCollapsed });
  }

  useJobStore.setState({
    job: restored.job,
    intent: restored.intent,
    fixed: restored.marks?.fixed ?? {},
    ignored: restored.marks?.ignored ?? {},
    accepted: restored.marks?.accepted ?? {},
  });

  bodies = restored.bodies;
}

/**
 * A card that was in the middle of being read when the tab went away.
 *
 * The worker died with the tab and the handle to the file went with it - a
 * `File` is a reference to the disk, and the browser does not hand references
 * across a reload. So the card says the file could not be read, which is what
 * happened, and offers the ways out that state already has: another file, or
 * the text typed in. A card left spinning for a worker that will never answer
 * would be the alternative.
 */
function settle(item: BufferItem): BufferItem {
  if (item.extract.state !== "reading" && item.extract.state !== "extracting") {
    return item;
  }
  return {
    ...item,
    extract: { ...item.extract, state: "failed", errorCode: "FILE_UNREADABLE" },
  };
}

/** The key a restored body is put back into the job cache under. */
export function bodyCacheKey(
  jobId: string,
  docId: string,
  module: ModuleId,
  ref: string,
): readonly unknown[] {
  return ["job-result", jobId, docId, module, ref];
}

export { resultKey };
