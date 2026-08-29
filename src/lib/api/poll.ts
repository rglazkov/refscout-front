import { type JobStatus } from "@/lib/domain";

/**
 * The pacing of the poll (§17). A job runs for minutes and a backgrounded tab
 * is the ordinary state on a phone, so polling does not stop when the tab goes
 * away: a stopped poll would mean a finished check waiting for the person to
 * come back before anyone learned of it. In the background the pause grows to a
 * ceiling instead, which is enough not to burn the battery and soon enough that
 * the result is on screen the moment they return.
 *
 * The delay is a function rather than a loop because the cache drives the poll:
 * server state belongs to TanStack Query, browser state to Zustand, and mixing
 * the two is what later produces manual invalidation and drift (M1.2.3).
 */
const STEPS_MS = [1000, 2000, 4000];
const BACKGROUND_CEILING_MS = 15_000;

export const terminalStates = ["finished", "partial", "failed", "cancelled"] as const;

export function isTerminal(state: JobStatus["state"]): boolean {
  return (terminalStates as readonly string[]).includes(state);
}

/**
 * How long to wait before the next poll: 1, 2, then 4 seconds, and up to 15 in
 * a hidden tab. The server may ask for longer through `pollAfterMs`, and that
 * advice is added on top of our own backoff rather than replacing it.
 */
export function nextPollDelayMs(
  attempt: number,
  options: { readonly hidden?: boolean; readonly pollAfterMs?: number } = {},
): number {
  const step = STEPS_MS[Math.min(attempt, STEPS_MS.length - 1)] ?? 4000;
  const base = options.hidden === true ? Math.max(step, BACKGROUND_CEILING_MS) : step;
  return base + (options.pollAfterMs ?? 0);
}
