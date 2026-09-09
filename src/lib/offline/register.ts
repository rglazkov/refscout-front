/**
 * Registering the shell's cache, and what happens when a new build appears.
 *
 * Registration waits for the page to have loaded and the precache runs behind
 * it, so a first visit pays for offline neither in time to interactivity nor in
 * traffic on the critical path.
 *
 * A waiting worker is not applied on its own. The code changes together with
 * the schema of the storage and its migrations, and the tab is holding an open
 * document: replacing the code under it would mean migrating in the middle of
 * somebody's work. So the new version waits, the application says it is there,
 * and it arrives either when the person asks for it or at the next full start.
 * There is a second reason, and it is not decorative: the build named in every
 * report we send has to be the build that is actually running.
 */

const SCRIPT = "sw.js";

let waiting: ServiceWorker | null = null;
const listeners = new Set<() => void>();

export function updateWaiting(): boolean {
  return waiting !== null;
}

export function subscribeToUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(worker: ServiceWorker | null): void {
  waiting = worker;
  for (const listener of listeners) listener();
}

/** Applies the version that is waiting, on a press and never on its own. */
export function applyUpdate(): void {
  waiting?.postMessage({ type: "apply-update" });
}

export function registerShell(basePath: string): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const start = () => {
    void navigator.serviceWorker
      .register(`${basePath}/${SCRIPT}`, { scope: `${basePath}/` })
      .then((registration) => {
        if (registration.waiting !== null) announce(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (installing === null) return;
          installing.addEventListener("statechange", () => {
            // Installed with a controller already in place means a version
            // standing behind the one this tab is running.
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller !== null
            ) {
              announce(installing);
            }
          });
        });
      })
      .catch(() => {
        // A browser that refuses to register one simply has no offline shell.
        // Nothing on screen depends on it having succeeded.
      });
  };

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });

  // The applied version takes the page with it, once. Reloading here rather
  // than leaving two versions of the code addressing one database is the whole
  // reason the update was made to wait in the first place.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
