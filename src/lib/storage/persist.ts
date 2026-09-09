import { track } from "@/lib/telemetry";

import { available } from "./db";
import { storageMode } from "./mode";

/**
 * The one thing that can be done about eviction, asked for at the one moment
 * where it explains itself.
 *
 * A granted origin is not evicted when the browser runs short of room and is
 * not cleared for not having been visited lately. That is the whole of what can
 * be set against the loss of somebody's only copy, and it costs a single call.
 *
 * When it is asked matters as much as that it is asked. Firefox turns this into
 * a question put to the person, and a question arriving on an empty screen
 * reads as nagging and is refused; the same question a moment after "my
 * document is in the buffer" answers itself. So it is called on the first
 * document that parses, not on the load of the page. Chrome decides without
 * asking, on its own signs of engagement, and the call there simply returns a
 * verdict. A refusal blocks nothing.
 */

let asked = false;

/** Whether this origin has been granted storage the browser will not evict. */
let granted: boolean | null = null;

export function persistenceGranted(): boolean | null {
  return granted;
}

/**
 * Asks for persistence and reports what the browser is giving us. Called as a
 * document appears in the buffer, and once per tab: the answer does not change
 * inside a session, and a second question is a second interruption.
 */
export async function requestPersistence(): Promise<void> {
  if (asked) return;
  asked = true;
  if (!available() || typeof navigator === "undefined") return;
  const storage = navigator.storage as StorageManager | undefined;
  if (storage === undefined) return;

  try {
    granted = typeof storage.persist === "function" ? await storage.persist() : null;
  } catch {
    // A browser that throws on the question is a browser that has not granted
    // it, and that is not a failure of anything on screen.
    granted = false;
  }
  await reportPressure();
}

/**
 * How much room the browser is giving us, as two numbers. Eviction is the one
 * loss of somebody's only copy that we do not control, and it has to be visible
 * as a figure before it is visible as a letter to support.
 */
export async function reportPressure(): Promise<void> {
  if (typeof navigator === "undefined") return;
  const storage = navigator.storage as StorageManager | undefined;
  if (storage === undefined || typeof storage.estimate !== "function") return;
  try {
    const estimate = await storage.estimate();
    track("storage_pressure", {
      code: "STORAGE_ESTIMATE",
      context: {
        usage: estimate.usage ?? 0,
        quota: estimate.quota ?? 0,
        persisted: granted === true,
        durable: storageMode().durable,
      },
    });
  } catch {
    // The estimate is a number about us, not a step of anybody's work.
  }
}
