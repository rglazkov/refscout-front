import { applyServerSwitch } from "./collection";
import type { ClientEvent } from "./events";

/**
 * The only part of this module that touches the network, and the only place in
 * the product outside `lib/api` that does.
 *
 * Three rules shape it, and all three are about failure. It never throws, so a
 * broken sender cannot break the screen it is reporting on. It never reports its
 * own failures, because an error inside error collection would report itself and
 * the recursion lands on the one person whose tab is already in trouble. And it
 * reports back only what the receiver confirmed, so nothing is treated as
 * delivered because a request was attempted.
 */
const ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

const ENDPOINT = `${ORIGIN}/client-events`;

/** How many go in one request. The buffer holds about this many. */
const BATCH = 50;

/**
 * Everything is sent as `text/plain`, including the batches that leave through
 * an ordinary `fetch`.
 *
 * The reason is the departing tab. A request made while the page is unloading
 * has to be a simple cross-origin request or the browser will not deliver it,
 * and `application/json` is not one: it earns a preflight, and there is no time
 * left for a preflight. The receiver accepts both types, so the one that works
 * everywhere is used everywhere - and the batch that leaves on the way out is
 * then the same request as every other, rather than a second path exercised
 * only at the worst possible moment.
 */
const CONTENT_TYPE = "text/plain;charset=UTF-8";

function body(events: readonly ClientEvent[]): string {
  return JSON.stringify({ events });
}

/**
 * What has to happen before a batch can go, handed in when the collectors are
 * attached to the page.
 *
 * Which server answers is a switch, and telemetry obeys it like everything
 * else - but it cannot ask the API layer about it. This module is the one that
 * sends without anybody pressing a button, so the rule that it reaches neither
 * the texts nor the module holding them is absolute and is held by a test
 * rather than by care. The shell knows both halves and joins them: it hands in
 * the callback, and nothing here imports anything of the API.
 *
 * The callback is called once a send is actually due, so a page nothing went
 * wrong on never loads a line of it.
 */
let prepare: () => Promise<void> = () => Promise.resolve();

export function prepareWith(before: () => Promise<void>): void {
  prepare = before;
}

async function ready(): Promise<void> {
  try {
    await prepare();
  } catch {
    // A source that would not start is a send that will not arrive, and the
    // queue is what that case is for.
  }
}

/** One flight at a time, so a batch is not sent twice while its answer is late. */
let inFlight: Promise<readonly string[]> | null = null;

/**
 * Sends what it is given and answers with the identifiers the receiver
 * confirmed. Everything absent from that answer stays where it was: a
 * connection that drops while the reply is on its way would otherwise erase an
 * event the server never received.
 */
export function deliver(events: readonly ClientEvent[]): Promise<readonly string[]> {
  if (events.length === 0) return Promise.resolve([]);
  inFlight ??= (async () => {
    const delivered: string[] = [];
    try {
      await ready();
      for (let at = 0; at < events.length; at += BATCH) {
        const batch = events.slice(at, at + BATCH);
        const answer = await post(batch);
        // A batch that did not arrive stops the run: the ones after it would
        // meet the same wall, and trying anyway is a burst of requests aimed at
        // a receiver that has just said it cannot take them.
        if (answer === null) break;
        for (const event of batch) delivered.push(event.id);
      }
    } catch {
      // Silent by design: see the note at the top of the file.
    } finally {
      inFlight = null;
    }
    return delivered;
  })();
  return inFlight;
}

type Accepted = { readonly collect?: string; readonly reportId?: string };

/**
 * One request. A `202` is the only answer that counts as delivery; anything
 * else leaves the batch where it is, to go at the next opportunity.
 */
async function post(events: readonly ClientEvent[]): Promise<Accepted | null> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": CONTENT_TYPE },
      // Nothing here needs to know who is signed in, and a request carrying no
      // credentials is a request the browser will still deliver during an
      // unload.
      credentials: "omit",
      body: body(events),
    });
    if (response.status !== 202) return null;

    const accepted = (await response.json()) as Accepted;
    applyServerSwitch(accepted.collect);
    return accepted;
  } catch {
    return null;
  }
}

/**
 * What leaves when the tab is going away.
 *
 * These are the last events of a session and the most interesting ones: the
 * ones collected in the moments before somebody closed a page that had broken
 * on them. An ordinary request does not survive the unload, so the browser is
 * handed the bytes to deliver on its own.
 *
 * Nothing is forgotten afterwards. There is no answer to wait for, so the
 * records stay in the queue and go again on the next visit - a duplicate the
 * receiver collapses by fingerprint, which is a great deal better than an event
 * dropped on the assumption that a beacon arrived.
 */
export function beacon(events: readonly ClientEvent[]): void {
  try {
    if (events.length === 0) return;
    navigator.sendBeacon(
      ENDPOINT,
      new Blob([body(events.slice(0, BATCH))], { type: CONTENT_TYPE }),
    );
  } catch {
    // The tab is closing; there is nowhere to report this to and nothing to fix.
  }
}

/**
 * A report a person wrote, sent at once rather than waiting for the next batch,
 * and carrying the events of the session with it. They are looking at the
 * screen and expecting an answer: the identifier the receiver gives back is
 * what they quote to support, so it has to arrive while they are still there to
 * read it - and the events that describe what went wrong are what makes the
 * sentence they wrote answerable.
 */
export async function sendNow(events: readonly ClientEvent[]): Promise<string | null> {
  await ready();
  const answer = await post(events.slice(0, BATCH));
  return answer?.reportId ?? null;
}
