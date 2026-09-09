import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Writer from "@/lib/tabs/writer";

/**
 * Which tab owns the buffer, and the one place our own protocol is added on top
 * of the browser's lock.
 *
 * The mistake this file exists to catch is invisible with two tabs. Web Locks
 * hands ownership to whoever joined the queue first, which is not what "work
 * here" means: pressed in a third tab, plain queue order sends the role to the
 * second, the third goes on looking at the curtain, and the person presses
 * again. So a tab that reaches the front while somebody else is the designated
 * successor lets the lock go and rejoins the queue.
 *
 * Three tabs are three module instances, because ownership is a fact about a
 * tab and the module holds it. They share one lock manager and one channel, the
 * way three tabs of a browser share the browser.
 */

type Task = () => Promise<void>;

type Tab = typeof Writer;

/** A first-come-first-served lock, which is what the browser gives us. */
function lockManager() {
  const queues = new Map<string, Task[]>();
  const running = new Set<string>();

  const pump = (name: string): void => {
    if (running.has(name)) return;
    const queue = queues.get(name) ?? [];
    const next = queue.shift();
    if (next === undefined) return;
    running.add(name);
    void next().then(() => {
      running.delete(name);
      pump(name);
    });
  };

  return {
    request: <T>(name: string, callback: () => Promise<T>): Promise<T> =>
      new Promise<T>((settle) => {
        const queue = queues.get(name) ?? [];
        queue.push(async () => {
          settle(await callback());
        });
        queues.set(name, queue);
        pump(name);
      }),
  };
}

/** A channel that carries a message to every listener but the sender's own. */
function channelBus() {
  const listeners = new Map<object, (event: { data: unknown }) => void>();
  class Fake {
    constructor(public readonly name: string) {}
    addEventListener(_type: string, handler: (event: { data: unknown }) => void): void {
      listeners.set(this, handler);
    }
    postMessage(data: unknown): void {
      for (const [owner, handler] of listeners) {
        if (owner === this) continue;
        // Asynchronous, as the real one is: a tab must never see its own
        // message arrive before the call that sent it has returned.
        queueMicrotask(() => handler({ data }));
      }
    }
    close(): void {
      listeners.delete(this);
    }
  }
  return Fake;
}

async function openTab(): Promise<Tab> {
  // A fresh module registry is a fresh tab: ownership is a fact about a tab,
  // and the module is where the tab keeps it.
  vi.resetModules();
  const tab = await import("@/lib/tabs/writer");
  tab.claimWriteRole();
  return tab;
}

/** Lets every queued microtask and lock handover run to a standstill. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

beforeEach(() => {
  const locks = lockManager();
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("BroadcastChannel", channelBus());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the tab that owns the buffer", () => {
  it("gives the role to the first tab and the curtain to the rest", async () => {
    const first = await openTab();
    await settle();
    const second = await openTab();
    await settle();

    expect(first.tabRole()).toBe("writer");
    expect(second.tabRole()).toBe("waiting");
  });

  it("hands the role to the tab the button was pressed in, not to the queue", async () => {
    const first = await openTab();
    await settle();
    const second = await openTab();
    await settle();
    const third = await openTab();
    await settle();

    third.claimHere();
    await settle();

    expect(third.tabRole()).toBe("writer");
    // The one that joined the queue first is still waiting, which is the whole
    // point: it did not take a role nobody asked it to take.
    expect(second.tabRole()).toBe("waiting");
    expect(first.tabRole()).toBe("waiting");
  });

  it("goes read-only before it lets the lock go", async () => {
    const first = await openTab();
    await settle();
    const second = await openTab();
    await settle();

    const seen: string[] = [];
    first.subscribeToRole(() => seen.push(first.tabRole()));

    second.claimHere();
    await settle();

    // Read-only first, the lock afterwards. The opposite order leaves a moment
    // in which the tab still takes keystrokes and no longer has the right to
    // record them: the edit appears on screen, the commit is refused, and the
    // person loses it without noticing.
    expect(seen).toEqual(["handing", "waiting"]);
    expect(second.tabRole()).toBe("writer");
  });

  it("treats itself as the only tab where there are no locks", async () => {
    vi.stubGlobal("navigator", {});
    const only = await openTab();
    await settle();
    expect(only.tabRole()).toBe("writer");
  });
});
