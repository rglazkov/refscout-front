/**
 * Whether the product can reach its server, as one fact for the whole
 * application.
 *
 * `navigator.onLine` answers "is there a connection", which is not the question
 * - a captive campus network answers yes and reaches nothing. So the flag is
 * made of both: what the browser says, and whether a request has actually just
 * failed. One flag, read by the banner and by the line under the run button
 * alike, because two of them drift apart and end up saying "no network" beside
 * an eager "Run the check".
 */

let reachable = true;
let refusedAt = 0;

/** How long a failed request keeps saying so without anything else happening. */
const DOUBT_MS = 20_000;

const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

export function subscribeToConnection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when there is every reason to think a request would arrive. */
export function online(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  if (!reachable && Date.now() - refusedAt < DOUBT_MS) return false;
  return true;
}

/** A request that did not reach the server at all - not one it refused. */
export function requestFailed(): void {
  reachable = false;
  refusedAt = Date.now();
  announce();
}

/** A request that arrived, whatever the server then said about it. */
export function requestArrived(): void {
  if (reachable) return;
  reachable = true;
  announce();
}

/** Starts listening to what the browser itself has to say. Called once. */
export function watchConnection(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    requestArrived();
    announce();
  });
  window.addEventListener("offline", announce);
}
