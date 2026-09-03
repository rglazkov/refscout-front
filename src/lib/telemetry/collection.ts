/**
 * Whether automatic collection is on, and the two switches that decide it.
 *
 * There are two because they answer to different people. The person reading the
 * page turns collection off from the interface, and their choice is remembered
 * in this browser beside the theme and the language. The server turns it off in
 * the answer to a batch, which is how collection that has started causing
 * trouble stops without an emergency release.
 *
 * Either one is enough to stop it, and neither touches the report a person
 * sends themselves by pressing "Report a problem": there they are shown exactly
 * what will go before it goes, which is the whole of what the switch protects.
 */
const STORAGE_KEY = "telemetry";

/** Only automatic collection is refusable, so the stored value has one shape. */
const REFUSED = "off";

/**
 * On by default, and said so on the privacy page along with where to turn it
 * off. Automatic reports are how a break that nobody writes in about is found
 * at all, and the events carry numbers, flags and codes - never a character of
 * anybody's manuscript - so the default that keeps the product fixable is the
 * one taken.
 */
let refusedHere: boolean | null = null;

/** The server's word, for this session only. It is not remembered anywhere. */
let stoppedByServer = false;

const listeners = new Set<() => void>();

function read(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === REFUSED;
  } catch {
    // A browser refusing storage refuses the choice as well, and the answer to
    // a question that cannot be asked is the default.
    return false;
  }
}

/** Whether this browser has been told to stop collecting on its own. */
export function collectionRefused(): boolean {
  refusedHere ??= read();
  return refusedHere;
}

export function collectionAllowed(): boolean {
  return !stoppedByServer && !collectionRefused();
}

/**
 * The choice made in the interface. Turning collection off drops what has
 * already been gathered and not yet sent: leaving a queue behind would mean the
 * next opportunity sends events collected before the person asked us to stop.
 */
export function refuseCollection(refused: boolean, dropQueue: () => void): void {
  refusedHere = refused;
  try {
    if (refused) localStorage.setItem(STORAGE_KEY, REFUSED);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // The choice still holds for this tab; a browser that will not store it is
    // not a reason to ignore it.
  }
  if (refused) dropQueue();
  for (const listener of listeners) listener();
}

/** The receiver's answer: `collect: 'off'` stops automatic collection at once. */
export function applyServerSwitch(collect: string | undefined): void {
  if (collect === undefined) return;
  const stopped = collect === "off";
  if (stopped === stoppedByServer) return;
  stoppedByServer = stopped;
  for (const listener of listeners) listener();
}

/** For the switch in the interface, which has to redraw when the answer changes. */
export function subscribeToCollection(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
