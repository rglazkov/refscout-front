import { newId } from "@/lib/webcrypto";

import { collectionAllowed, refuseCollection } from "./collection";
import {
  type Breadcrumb,
  type BreadcrumbAction,
  type BreadcrumbOutcome,
  type ClientEvent,
  type EventCode,
  type EventContext,
  type EventKind,
  type UserReport,
} from "./events";
import { RELEASE, locale, route, theme, viewport } from "./environment";
import { SESSION_CAP, drop, enqueue, forget, queued } from "./queue";
import { beacon, deliver, prepareWith, sendNow } from "./sender";

export {
  applyServerSwitch,
  collectionAllowed,
  collectionRefused,
  subscribeToCollection,
} from "./collection";
export {
  breadcrumbActions,
  breadcrumbOutcomes,
  eventCodes,
  eventKinds,
  type Breadcrumb,
  type ClientEvent,
  type EventCode,
  type EventContext,
  type EventKind,
  type UserReport,
} from "./events";
export { RELEASE } from "./environment";

/**
 * What the product reports about itself, and the two rules the whole of it
 * exists under.
 *
 * Nothing from a document ever reaches here. The types say so - `context` takes
 * numbers and flags, `code` takes an enumeration and a path - and the one piece
 * of free text in an event is the sentence a person typed into the report form
 * knowing they were typing it.
 *
 * And collection is not allowed to fail or to loop. `track()` never throws, and
 * a failure inside the sender is swallowed rather than reported: an error report
 * that produces an error report is a recursion that lands on the one person
 * whose tab has already broken.
 */

/** The last actions, and how each ended. About thirty, as a path rather than a log. */
const TRAIL = 30;

const trail: Breadcrumb[] = [];

/**
 * What has been collected and not yet confirmed, mirrored in memory.
 *
 * The queue in IndexedDB is what survives a reload; this is what the report form
 * shows a person before they send it, and what the tests read. The two hold the
 * same events, and both let go of one on the same confirmation.
 */
const pending: ClientEvent[] = [];

/** Distinct events this session may produce. Identical ones raise a count instead. */
let produced = 0;

function now(): string {
  return new Date().toISOString();
}

/**
 * What makes two events the same event. Kind, code and address answer "the same
 * thing went wrong in the same place"; the build is in it because the same
 * symptom in two releases is two different defects, and collapsing them would
 * hide the release that introduced one.
 */
function fingerprintOf(kind: EventKind, code: EventCode): string {
  return `${kind}|${code}|${route()}|${RELEASE}`;
}

type Details = {
  readonly code: EventCode;
  readonly context?: EventContext;
  /** The identifier of the request this is about, as the server returned it. */
  readonly requestId?: string;
};

/**
 * Records that something happened.
 *
 * Calls to it sit beside the code they are about rather than being gathered
 * afterwards, which is why it has existed since long before anything was being
 * sent: an event added at the moment the case is understood says what the case
 * was, and one added later says what somebody remembered about it.
 */
export function track(kind: EventKind, details: Details): void {
  try {
    if (!collectionAllowed()) return;

    const fingerprint = fingerprintOf(kind, details.code);
    const seen = pending.find((event) => event.fingerprint === fingerprint);
    if (seen !== undefined) {
      const raised = { ...seen, count: seen.count + 1 };
      pending[pending.indexOf(seen)] = raised;
      void enqueue(raised);
      return;
    }

    // The ceiling is on distinct events: one failure repeating inside a render
    // loop is collapsed above and never reaches it, so hitting it means many
    // different things went wrong, and the first two hundred of those describe
    // the session as well as a thousand would.
    if (produced >= SESSION_CAP) return;
    produced += 1;

    const event = build(kind, details);
    pending.push(event);
    void enqueue(event);
    schedule();
  } catch {
    // Collection neither fails loudly nor gets in the way of the work.
  }
}

function build(kind: EventKind, details: Details): ClientEvent {
  return {
    id: newId(),
    ts: now(),
    kind,
    code: details.code,
    fingerprint: fingerprintOf(kind, details.code),
    count: 1,
    release: RELEASE,
    route: route(),
    locale: locale(),
    theme: theme(),
    viewport: viewport(),
    context: details.context ?? {},
    breadcrumbs: [...trail],
    ...(details.requestId === undefined || details.requestId === ""
      ? {}
      : { requestId: details.requestId }),
  };
}

/**
 * One step of the path a person took. The name of the action and how it ended,
 * and nothing about what they were working on: this is what makes a crash
 * readable without a single character of the document it happened over.
 */
export function breadcrumb(action: BreadcrumbAction, outcome: BreadcrumbOutcome): void {
  try {
    if (!collectionAllowed()) return;
    trail.push({ action, outcome, ts: now() });
    if (trail.length > TRAIL) trail.shift();
  } catch {
    // As above: nothing here may get in the way of the action it describes.
  }
}

/**
 * When a batch goes. Not on every event: a page that has just started failing
 * produces several in a row, and one request carrying all of them is both
 * cheaper for us and quieter for the person whose tab is already struggling.
 */
const SETTLE_MS = 3_000;

let settling: ReturnType<typeof setTimeout> | null = null;

function schedule(): void {
  if (typeof window === "undefined") return;
  if (settling !== null) return;
  settling = setTimeout(() => {
    settling = null;
    void flushNow();
  }, SETTLE_MS);
}

/**
 * Sends what is waiting and lets go of exactly what came back confirmed.
 *
 * What to send is read from the mirror rather than from the queue, and that is
 * deliberate: a browser that will not give us IndexedDB - a private window,
 * storage refused - would otherwise have nothing to send at all, and the
 * session that is hardest to see into would be the one that reported nothing.
 * The queue is what makes an event survive the tab, not what makes it exist.
 */
export async function flushNow(): Promise<void> {
  const delivered = new Set(await deliver([...pending]));
  if (delivered.size === 0) return;
  for (let at = pending.length - 1; at >= 0; at -= 1) {
    const event = pending[at];
    if (event !== undefined && delivered.has(event.id)) pending.splice(at, 1);
  }
  await forget([...delivered]);
}

let installed = false;

/**
 * Attaches the collectors to the page. Everything they catch is something no
 * other part of the product sees: an exception outside a handler, a promise
 * nobody awaited, and the batch that would otherwise be lost with the tab.
 */
export function install(before?: () => Promise<void>): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // What the sender has to do before a batch can go - starting the mock, on a
  // build that answers itself. It is handed in rather than reached for: this
  // module may not import the API layer, and the shell is where the two halves
  // are joined.
  if (before !== undefined) prepareWith(before);

  window.addEventListener("error", (event) => {
    // A failed <script> or <img> raises the same event with no error attached.
    // It is not a crash and it is not reported as one.
    if (event.error == null) return;
    track("js_error", { code: "UNCAUGHT_ERROR" });
  });

  window.addEventListener("unhandledrejection", () => {
    track("promise_rejection", { code: "UNHANDLED_REJECTION" });
  });

  /*
   * A tab going away, in the two ways a browser announces it. `visibilitychange`
   * is the one that matters on a phone, where the tab is put into the background
   * first and killed later, silently and without another event; `pagehide`
   * covers the ordinary close. There is no `beforeunload` anywhere in the
   * product, and this is not a place to introduce one: it cannot wait for an
   * asynchronous write and it never fires on a background kill at all.
   */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") beacon(pending);
  });
  window.addEventListener("pagehide", () => beacon(pending));

  // A connection coming back is the first opportunity the queue was waiting for.
  window.addEventListener("online", () => void flushNow());

  // Once a session, and silent unless the origin is actually running out of
  // room. The queue itself lives in that storage, so pressure on it is pressure
  // on the one thing that would tell us about it.
  void reportStoragePressure();

  // Whatever the last session did not manage to deliver goes first.
  void restore();
}

/**
 * Picks up what an earlier session left behind. The queue outlives the tab, so
 * the events of a session that ended in a crash are read back here and sent
 * before anything new is collected.
 */
async function restore(): Promise<void> {
  try {
    if (!collectionAllowed()) return;
    for (const event of await queued()) {
      if (!pending.some((held) => held.id === event.id)) pending.push(event);
    }
    await flushNow();
  } catch {
    // A queue that cannot be read is an empty one, and an empty one is a
    // perfectly ordinary way for a session to start.
  }
}

/**
 * The share of the quota that counts as pressure worth hearing about.
 *
 * Under it there is nothing to say, and an event on every page load would be
 * the loudest thing this module produces while answering no question at all.
 * Over it the origin is approaching the point at which the browser starts
 * evicting - and eviction is the only loss of a person's single copy of their
 * manuscript that we do not control.
 */
const PRESSURE = 0.6;

/**
 * How much room the browser is giving this origin, as two numbers.
 *
 * It has to be visible as a figure on the day it starts happening rather than
 * as a letter to support weeks later. A verdict from `persist()` travels with
 * it when there is one, and is always worth reporting: asking for persistence
 * is the storage layer's business and the moment it asks matters, so this
 * reports the answer rather than asking the question itself.
 */
export async function reportStoragePressure(persisted?: boolean): Promise<void> {
  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage ?? 0;
    const quota = estimate.quota ?? 0;
    const tight = quota > 0 && usage / quota >= PRESSURE;
    if (!tight && persisted === undefined) return;
    track("storage_pressure", {
      code: "STORAGE_ESTIMATE",
      context: {
        usage,
        quota,
        ...(persisted === undefined ? {} : { persisted }),
      },
    });
  } catch {
    // A browser that will not answer the question is not a fault to report.
  }
}

/** What the report form shows, and what the tests read. */
export function peekEvents(): readonly ClientEvent[] {
  return [...pending];
}

export function drainEvents(): readonly ClientEvent[] {
  const taken = pending.splice(0, pending.length);
  void forget(taken.map((event) => event.id));
  return taken;
}

/** The trail as it stands, for the form that shows a person what will be sent. */
export function peekTrail(): readonly Breadcrumb[] {
  return [...trail];
}

/**
 * Everything this browser is holding, dropped. Two gestures reach it - turning
 * automatic collection off, and signing out - and both are gestures of privacy
 * rather than steps of the work.
 */
export function clearCollected(): void {
  pending.length = 0;
  trail.length = 0;
  produced = 0;
  void drop();
}

/** The switch in the interface. Turning it off leaves nothing behind. */
export function setCollectionRefused(refused: boolean): void {
  refuseCollection(refused, clearCollected);
  if (refused) {
    pending.length = 0;
    trail.length = 0;
  }
}

/**
 * Which parts of a report the person left ticked. Anything unticked is not
 * blanked on the receiver's side or filtered out of a log later - it is never
 * put into the body at all.
 */
export type ReportParts = {
  readonly release: boolean;
  readonly route: boolean;
  readonly localeAndTheme: boolean;
  readonly viewport: boolean;
  readonly events: boolean;
  readonly requestId: boolean;
};

export type ReportInput = {
  readonly message: string;
  /** Attached only when the person selected it and confirmed; absent by default. */
  readonly excerpt?: string;
  readonly requestId?: string;
  readonly parts: ReportParts;
};

/**
 * A report a person wrote, sent on its own and answered with an identifier they
 * can quote to support.
 *
 * It is put in the queue before it is sent, like everything else: a report lost
 * to a dropped connection is the one event whose absence the person would
 * notice, because they watched themselves write it.
 */
export async function sendReport(input: ReportInput): Promise<string | null> {
  const report: UserReport = {
    message: input.message,
    ...(input.excerpt === undefined || input.excerpt === ""
      ? {}
      : { excerpt: input.excerpt }),
  };

  const summary = input.parts.events ? pending : [];

  const event: ClientEvent = {
    id: newId(),
    ts: now(),
    kind: "user_report",
    code: "USER_REPORT",
    fingerprint: `user_report|${newId()}`,
    count: 1,
    // An unticked row is sent empty. The receiver reads a blank as "the person
    // took this out", which is a fact worth having: a report with the build
    // removed is still a report, and a build silently invented for it is not.
    release: input.parts.release ? RELEASE : "",
    route: input.parts.route ? route() : "",
    locale: input.parts.localeAndTheme ? locale() : "",
    theme: theme(),
    viewport: input.parts.viewport ? viewport() : { w: 0, h: 0 },
    context: input.parts.events ? { events: summary.length } : {},
    breadcrumbs: input.parts.events ? [...trail] : [],
    ...(input.parts.requestId && input.requestId !== undefined && input.requestId !== ""
      ? { requestId: input.requestId }
      : {}),
    report,
  };

  await enqueue(event);

  // The events of the session travel with it, in one batch: the person has just
  // said that something broke, and those events are the reason they were
  // collected at all. When they were unticked, the report goes alone.
  const batch = input.parts.events ? [...pending, event] : [event];
  const reportId = await sendNow(batch);
  if (reportId === null) {
    // Kept, and it goes at the next opportunity. It is the one event whose
    // absence the person would notice, because they watched themselves write it.
    return null;
  }

  const delivered = new Set(batch.map((held) => held.id));
  for (let at = pending.length - 1; at >= 0; at -= 1) {
    const held = pending[at];
    if (held !== undefined && delivered.has(held.id)) pending.splice(at, 1);
  }
  await forget([...delivered]);
  return reportId;
}
