import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isParseFailure } from "@/lib/parse/failure";
import { createWorkerClient } from "@/workers/client";
import { type WorkerCall, type WorkerReply } from "@/workers/protocol";

/**
 * How a call finds a worker to run on, which is the one stretch of the parsing
 * path where a document can be lost without ever having been read.
 *
 * The failure this guards against was reported by a person, not by a test, and
 * it looked nothing like a timing bug: a document of forty bytes came back
 * "could not be read" while three other files were being read beside it. What
 * had happened is that a worker's silence was being taken as proof that the
 * browser refuses this kind of worker - which is true of a browser that refuses
 * them and false of a machine that is merely busy, and there is no way to tell
 * the two apart except by how long you are willing to wait.
 *
 * So the rule these cases hold to is about what silence is allowed to decide.
 * While there is another way of starting a worker left in the list, silence
 * decides to try it, and three seconds is the right price for that: being wrong
 * costs a larger download. On the last way there is nothing to decide, so
 * silence decides nothing and the call simply waits under its own ceiling.
 */

/** A worker that says hello after a while, or never, and answers what it is asked. */
function fakeWorker(options: {
  /** When it announces itself, or nothing at all if it never does. */
  readonly readyAfterMs?: number;
}): Worker {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const emit = (type: string, event: unknown): void => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };

  if (options.readyAfterMs !== undefined) {
    setTimeout(() => {
      const reply: WorkerReply = { id: "", type: "ready" };
      emit("message", { data: reply });
    }, options.readyAfterMs);
  }

  return {
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners.get(type)?.delete(listener);
    },
    postMessage: (message: WorkerCall) => {
      const reply: WorkerReply<string> = {
        id: message.id,
        type: "done",
        payload: "read",
      };
      setTimeout(() => emit("message", { data: reply }), 0);
    },
    terminate: () => listeners.clear(),
  } as unknown as Worker;
}

/** Never says hello: what a browser that will not run this kind of worker does. */
const silent = () => fakeWorker({});
/** Says hello eventually: what a machine with nothing to spare does. */
const slow = (afterMs: number) => () => fakeWorker({ readyAfterMs: afterMs });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Lets the timers run to a point, letting the promises between them settle. */
async function pass(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("finding a worker to run on", () => {
  it("waits for the last way in the list rather than calling the document unreadable", async () => {
    const client = createWorkerClient<string, string>([slow(9_000)], "parse");
    const call = client.run("a document", { timeoutMs: 60_000 });

    // Well past the three seconds that used to end it, and nothing has failed.
    await pass(5_000);
    await pass(10_000);

    await expect(call).resolves.toBe("read");
  });

  it("still hands over to the next way when the first stays silent", async () => {
    const client = createWorkerClient<string, string>([silent, slow(1_000)], "parse");
    const call = client.run("a document", { timeoutMs: 60_000 });

    await pass(5_000);

    await expect(call).resolves.toBe("read");
  });

  it("gives up on the call once the ceiling is spent, and not before", async () => {
    const client = createWorkerClient<string, string>([silent], "parse");
    const call = client.run("a document", { timeoutMs: 10_000 });
    const settled = call.catch((cause: unknown) => cause);

    await pass(11_000);

    const cause = await settled;
    expect(isParseFailure(cause) && cause.code).toBe("WORKER_CRASHED");
  });

  it("the way that answered here is the way the next call takes", async () => {
    // The first call proves the fallback, and the second must not pay the
    // three seconds of silence again to find out what is already known.
    const client = createWorkerClient<string, string>([silent, slow(500)], "parse");
    const first = client.run("first", { timeoutMs: 60_000 });
    await pass(5_000);
    await expect(first).resolves.toBe("read");

    const second = client.run("second", { timeoutMs: 60_000 });
    await pass(600);
    await expect(second).resolves.toBe("read");
  });

  it("stops waiting for a worker to say hello when the person says stop", async () => {
    const client = createWorkerClient<string, string>([slow(30_000)], "parse");
    const stop = new AbortController();
    const call = client.run("a document", {
      timeoutMs: 60_000,
      signal: stop.signal,
    });
    const settled = call.catch((cause: unknown) => cause);

    await pass(1_000);
    stop.abort();
    await pass(0);

    const cause = await settled;
    expect(isParseFailure(cause) && cause.code).toBe("CANCELLED");
  });

  it("stops waiting for a place in the pool when the person says stop", async () => {
    /*
     * Until a way of starting a worker has answered, the pool holds one
     * instance however large it is allowed to be - so the second document is
     * queued behind the first one's handshake, and that is exactly the wait
     * that got long.
     */
    const client = createWorkerClient<string, string>([slow(30_000)], "parse", 3);
    const first = client.run("first", { timeoutMs: 60_000 });
    const stop = new AbortController();
    const second = client.run("second", { timeoutMs: 60_000, signal: stop.signal });
    const settled = second.catch((cause: unknown) => cause);

    await pass(1_000);
    stop.abort();
    await pass(0);

    const cause = await settled;
    expect(isParseFailure(cause) && cause.code).toBe("CANCELLED");

    // And the one still waiting is left waiting rather than taken down with it.
    await pass(30_000);
    await expect(first).resolves.toBe("read");
  });
});
