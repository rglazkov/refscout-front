import { newId } from "@/lib/webcrypto";
import { guardWrites, settled } from "@/lib/storage";
import { track } from "@/lib/telemetry";

/**
 * Which tab owns the buffer, and how the ownership moves.
 *
 * Two tabs writing to one database is a race in which they overwrite each
 * other's state, and what is lost is what somebody believed was saved. So the
 * right to write belongs to one tab, and the others show a curtain saying where
 * the application is open with a button that brings it here. A curtain is
 * honester than a silent block: somebody who opened a second tab by accident
 * learns why and has one press out of it.
 *
 * Ownership is held by a lock and not by an agreement over messages. The case
 * an agreement is written for is the case it cannot survive: the owning tab did
 * not close, it died - out of memory reading a three-million-character PDF,
 * killed in the background by a phone, gone with the browser. There is no
 * farewell message because there is nobody left to send one, and the second tab
 * waits for ever with a manuscript on screen it may not touch. Web Locks is
 * released by the browser, which knows a tab has died and we do not.
 *
 * The channel stays and does what a channel is for: waking the other tabs when
 * ownership moves, raising and dropping the curtain without anybody polling,
 * and carrying the press of "work here". Ownership on the lock, awareness on
 * the channel, and the two must not be confused for one another.
 */

const LOCK = "refscout-writer";
const CHANNEL = "refscout-tabs";

/** How long a claim stands before ordinary queue order takes over again. */
const CLAIM_MS = 5000;

export type TabRole =
  /** This tab owns the buffer. */
  | "writer"
  /** Another tab does, and this one is showing the curtain. */
  | "waiting"
  /** This tab is giving the role up: read-only, finishing its writes. */
  | "handing";

type Message =
  | { readonly type: "claim"; readonly id: string }
  | { readonly type: "took"; readonly id: string };

const id = newId();

let role: TabRole = "writer";
let channel: BroadcastChannel | null = null;
let release: (() => void) | null = null;
let designated: string | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;
let started = false;

/**
 * Set when a write was refused because the role had gone. It is not the same as
 * merely waiting: something the person had already typed did not reach the
 * database, and the curtain says so rather than looking like an ordinary
 * second tab.
 */
let lostWrite = false;

const listeners = new Set<() => void>();

export function tabRole(): TabRole {
  return role;
}

export function writeRefused(): boolean {
  return lostWrite;
}

export function subscribeToRole(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(next: TabRole): void {
  if (role === next) return;
  role = next;
  for (const listener of listeners) listener();
}

function post(message: Message): void {
  channel?.postMessage(message);
}

function remember(successor: string): void {
  designated = successor;
  if (expiry !== null) clearTimeout(expiry);
  // A successor that died between pressing the button and being handed the
  // role would otherwise leave every waiting tab refusing the lock for ever.
  expiry = setTimeout(() => {
    designated = null;
  }, CLAIM_MS);
}

/**
 * Starts the protocol. It is called once, as the working screen mounts.
 *
 * Where `navigator.locks` is missing there is no curtain at all: the tab treats
 * itself as the only one and works. Holding somebody in front of a curtain on
 * the strength of something we could not check is the wrong way to be wrong -
 * one way costs a rare race between two tabs, which the single write
 * transaction already narrows, and the other costs somebody the ability to
 * touch their own manuscript.
 */
export function claimWriteRole(): void {
  if (started || typeof navigator === "undefined") return;
  started = true;

  guardWrites(
    () => role === "writer",
    () => {
      lostWrite = true;
      announce("waiting");
    },
  );

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener("message", (event: MessageEvent<Message>) => {
      const message = event.data;
      if (message.type === "claim") {
        remember(message.id);
        if (role === "writer") void handOver();
        return;
      }
      if (message.id === designated) designated = null;
    });
  }

  const locks = navigator.locks as LockManager | undefined;
  if (locks === undefined) {
    // Not a fault, and not something the person is told about - a figure, so
    // that how often the product runs without the curtain is known.
    track("storage_pressure", { code: "LOCKS_UNAVAILABLE" });
    announce("writer");
    return;
  }

  announce("waiting");
  void queue(locks);
}

/**
 * Waits for the lock, and takes the role only if it is this tab's turn in the
 * sense the person meant.
 *
 * The queue is first come, first served, which is not what "work here" means.
 * Pressed in a third tab, plain queue order would hand the role to the second,
 * the third would go on looking at the curtain, and the person would press
 * again. So a tab that reaches the front while somebody else is the designated
 * successor lets the lock go again and rejoins the queue.
 */
async function queue(locks: LockManager): Promise<void> {
  for (;;) {
    const mine = await locks.request(LOCK, async () => {
      if (designated !== null && designated !== id) return false;
      designated = null;
      lostWrite = false;
      announce("writer");
      post({ type: "took", id });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return true;
    });
    if (mine) {
      // The role was given up deliberately, and the tab is a waiting one again.
      announce("waiting");
    }
  }
}

/**
 * Gives the role up, in the order that makes the handover safe.
 *
 * The editor goes read-only first and the curtain appears; then the writes
 * already started are waited for; and only then is the lock let go. The other
 * order - let go, then stop writing - leaves a moment in which the tab still
 * takes keystrokes and no longer has the right to record them: the edit appears
 * on screen, the commit is refused, and the person loses it without noticing.
 * That is the one place in the product where an applied and visible edit could
 * vanish silently, and this order is what closes it.
 */
async function handOver(): Promise<void> {
  announce("handing");
  await settled();
  release?.();
  release = null;
}

/** Presses "work here": asks the owning tab for the role and waits for it. */
export function claimHere(): void {
  lostWrite = false;
  remember(id);
  post({ type: "claim", id });
  // The only tab in the browser has nobody to ask, so it simply carries on.
  if (role === "writer") designated = null;
}

/** For the tests, which need a tab that has not run the protocol. */
export function resetWriteRole(): void {
  started = false;
  role = "writer";
  designated = null;
  lostWrite = false;
  release = null;
  channel?.close();
  channel = null;
  if (expiry !== null) clearTimeout(expiry);
}

/** This tab's own identifier, so a test can name the successor. */
export function tabId(): string {
  return id;
}
