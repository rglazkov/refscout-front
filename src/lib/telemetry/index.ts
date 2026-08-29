import type { ClientEvent, EventCode, EventContext, EventName } from "./events";

export type { ClientEvent, EventCode, EventContext, EventName } from "./events";

/**
 * The telemetry skeleton, with no sender (M0.6.3). Events go into an in-memory
 * ring buffer and travel nowhere: the IndexedDB queue, coalescing and sending
 * arrive in M6.
 *
 * The point of the skeleton is that track() calls are placed alongside the code
 * they belong to, instead of being hunted down afterwards.
 *
 * Collection is not allowed to fail or to loop: track() never throws.
 */
const RING_CAPACITY = 200;

const ring: ClientEvent[] = [];

export function track(
  name: EventName,
  details?: { readonly code?: EventCode; readonly context?: EventContext },
): void {
  try {
    const event: ClientEvent = {
      name,
      at: Date.now(),
      ...(details?.code === undefined ? {} : { code: details.code }),
      ...(details?.context === undefined ? {} : { context: details.context }),
    };
    ring.push(event);
    if (ring.length > RING_CAPACITY) ring.shift();
  } catch {
    // An error inside collection neither triggers another send nor gets in the way.
  }
}

/** For the tests and the "Report a problem" screen only (M6). */
export function drainEvents(): readonly ClientEvent[] {
  return ring.splice(0, ring.length);
}

export function peekEvents(): readonly ClientEvent[] {
  return [...ring];
}
