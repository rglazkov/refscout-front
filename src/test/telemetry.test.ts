// @vitest-environment jsdom
import "fake-indexeddb/auto";

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  applyServerSwitch,
  clearCollected,
  drainEvents,
  eventKinds,
  flushNow,
  install,
  peekEvents,
  sendReport,
  setCollectionRefused,
  track,
  type ClientEvent,
} from "@/lib/telemetry";

import { deliveredEvents, handlers, resetMockServer } from "./msw/handlers";

/**
 * What the product is allowed to say about itself, and what it is not.
 *
 * The claim being checked here cannot be checked at a call site: every `track()`
 * in the code could be written correctly and a manuscript still reach the wire
 * through a field somebody added later. So these tests read what actually left
 * - the bodies the receiver was handed - rather than what the calls intended.
 */
const server = setupServer(...handlers);

/** jsdom has no beacon, and what it would deliver is the subject of a test. */
const beaconed: string[] = [];

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (_url: string, body: Blob) => {
      void body.text().then((text) => beaconed.push(text));
      return true;
    },
  });
});

beforeEach(async () => {
  resetMockServer();
  beaconed.length = 0;
  setCollectionRefused(false);
  clearCollected();
  await Promise.resolve();
});

afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Sends now rather than waiting out the pause that batches events in the
 * product. What the pause is for is not spending a request per event on a page
 * that has started failing, and a test that waited three seconds per case would
 * be checking the clock rather than the sender.
 */
async function settle(): Promise<void> {
  await flushNow();
  for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();
}

/** Long enough for the database's own turns of the loop, which are not microtasks. */
async function tick(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function sent(): ClientEvent[] {
  return deliveredEvents() as ClientEvent[];
}

describe("the shape of an event", () => {
  it("carries numbers, flags and enumerations and nothing else", () => {
    // Every kind, so a field added for one of them cannot slip through on the
    // strength of the others being clean.
    for (const kind of eventKinds) {
      track(kind, {
        code: "PARSE_FAILED:probe",
        context: { pages: 34, printableRatio: 0.98, persisted: true },
      });
    }

    const events = drainEvents();
    expect(events).toHaveLength(eventKinds.length);

    for (const event of events) {
      for (const value of Object.values(event.context)) {
        expect(["number", "boolean"]).toContain(typeof value);
      }
      // A crumb is a name and an outcome, never what was being worked on.
      for (const crumb of event.breadcrumbs) {
        expect(Object.keys(crumb).sort()).toEqual(["action", "outcome", "ts"]);
      }
      expect(event.code.startsWith("PARSE_FAILED")).toBe(true);
      expect(event.count).toBe(1);
      expect(typeof event.fingerprint).toBe("string");
    }
  });

  it("refuses a string in the context at build time", () => {
    track("extract_suspicious", {
      code: "PARSE_FAILED",
      // @ts-expect-error - a string in the context is the door a fragment of a
      // manuscript would arrive through, and the type is what keeps it shut.
      context: { name: "chapter-3.pdf" },
    });
    drainEvents();
  });

  it("collapses what is identical and counts it instead", () => {
    track("js_error", { code: "UNCAUGHT_ERROR" });
    track("js_error", { code: "UNCAUGHT_ERROR" });
    track("js_error", { code: "UNCAUGHT_ERROR" });

    const events = drainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.count).toBe(3);
  });
});

describe("the four ways something is found out", () => {
  it("delivers a crash, a bad answer, a bad parse and a report the person wrote", async () => {
    install();
    track("js_error", { code: "UNCAUGHT_ERROR" });
    track("schema_error", { code: "SCHEMA_MISMATCH:job.documents[0].modules" });
    track("extract_failed", {
      code: "PARSE_FAILED:NO_TEXT_LAYER",
      context: { pages: 0 },
    });
    track("worker_error", { code: "WORKER_CRASHED" });
    await settle();

    const kinds = sent().map((event) => event.kind);
    expect(kinds).toContain("js_error");
    expect(kinds).toContain("schema_error");
    expect(kinds).toContain("extract_failed");
    // A worker that dies answers no message and rejects no promise: without its
    // own event the failure is silent on both sides of the port.
    expect(kinds).toContain("worker_error");

    const schema = sent().find((event) => event.kind === "schema_error");
    expect(schema?.code).toBe("SCHEMA_MISMATCH:job.documents[0].modules");
  });
});

describe("sending", () => {
  it("keeps what was not delivered and sends it at the next opportunity", async () => {
    server.use(
      http.post("*/client-events", () => new HttpResponse(null, { status: 503 })),
    );

    track("api_error", { code: "API_REFUSED:SERVICE_UNAVAILABLE" });
    await settle();
    expect(sent()).toHaveLength(0);
    // Held rather than dropped: a record leaves the queue on a confirmed send
    // and never on an attempt.
    expect(peekEvents()).toHaveLength(1);

    server.resetHandlers();
    track("network_error", { code: "NETWORK_FAILED" });
    await settle();

    const codes = sent().map((event) => event.code);
    expect(codes).toContain("API_REFUSED:SERVICE_UNAVAILABLE");
    expect(codes).toContain("NETWORK_FAILED");
    expect(peekEvents()).toHaveLength(0);
  });

  it("does not answer a failure of its own with another send", async () => {
    let requests = 0;
    server.use(
      http.post("*/client-events", () => {
        requests += 1;
        return HttpResponse.json({ nonsense: true }, { status: 500 });
      }),
    );

    track("js_error", { code: "UNCAUGHT_ERROR" });
    await settle();

    // One attempt, and no event about the attempt. A report of an error that
    // produces a report of an error is a recursion landing on the one person
    // whose tab has already broken, so the failure of a send is swallowed
    // whole - and the event it was carrying simply stays where it was.
    expect(requests).toBe(1);
    expect(peekEvents().map((event) => event.kind)).toEqual(["js_error"]);
  });

  it("stops collecting when the receiver says to, and still sends a report by hand", async () => {
    server.use(
      http.post("*/client-events", () =>
        HttpResponse.json({ collect: "off", reportId: "rep_switch" }, { status: 202 }),
      ),
    );

    track("js_error", { code: "UNCAUGHT_ERROR" });
    await settle();

    track("promise_rejection", { code: "UNHANDLED_REJECTION" });
    expect(peekEvents()).toHaveLength(0);

    const reportId = await sendReport({
      message: "the list of references is one short",
      parts: {
        release: true,
        route: true,
        localeAndTheme: true,
        viewport: true,
        events: true,
        requestId: true,
      },
    });
    expect(reportId).toBe("rep_switch");

    // The switch belongs to the session rather than to this test.
    applyServerSwitch("on");
  });

  it("hands the last events to the browser when the tab goes away", async () => {
    install();
    track("react_error", { code: "RENDER_FAILED:results" });

    /*
     * A tab is announced as leaving in two ways, and the product listens for
     * both: `visibilitychange` is the one that matters on a phone, where the
     * tab is backgrounded first and killed later without another event, and
     * `pagehide` covers an ordinary close. jsdom reports a visible document, so
     * what is exercised here is the second.
     */
    window.dispatchEvent(new Event("pagehide"));
    for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();

    const delivered = beaconed.map(
      (body) => JSON.parse(body) as { events: ClientEvent[] },
    );
    expect(
      delivered.flatMap((batch) => batch.events).map((event) => event.kind),
    ).toContain("react_error");
  });
});

describe("the queue", () => {
  it("survives the tab and goes at the first opportunity", async () => {
    const { http, HttpResponse: Reply } = await import("msw");
    // Nothing is delivered while this session is running, so what is left is
    // exactly what an interrupted session leaves behind.
    server.use(http.post("*/client-events", () => new Reply(null, { status: 503 })));

    track("worker_error", { code: "WORKER_CRASHED" });
    await settle();
    await tick();
    expect(sent()).toHaveLength(0);

    /*
     * The reload. Every module is forgotten and the whole of telemetry is
     * imported again, exactly as a new tab would import it - while the database
     * stays where it was, which is the point being checked.
     */
    server.resetHandlers();
    vi.resetModules();
    const reloaded = await import("@/lib/telemetry");
    reloaded.install();
    await tick();
    await reloaded.flushNow();
    await tick();

    expect(sent().map((event) => event.code)).toContain("WORKER_CRASHED");

    // The session that follows starts with an empty queue: a record leaves it
    // on a confirmed send, and this one was confirmed.
    vi.resetModules();
    clearCollected();
  });
});

describe("the switch in the interface", () => {
  it("collects nothing while it is off, and leaves nothing behind when turned off", async () => {
    track("js_error", { code: "UNCAUGHT_ERROR" });
    expect(peekEvents()).toHaveLength(1);

    setCollectionRefused(true);
    expect(peekEvents()).toHaveLength(0);

    track("js_error", { code: "UNCAUGHT_ERROR" });
    await settle();
    expect(peekEvents()).toHaveLength(0);
    expect(sent()).toHaveLength(0);

    setCollectionRefused(false);
  });
});

describe("a report somebody wrote", () => {
  const everything = {
    release: true,
    route: true,
    localeAndTheme: true,
    viewport: true,
    events: true,
    requestId: true,
  };

  it("carries the events of the session with it", async () => {
    track("schema_error", { code: "SCHEMA_MISMATCH:job.documents[0]" });

    await sendReport({
      message: "the numbers on the card and in the list disagree",
      parts: everything,
    });

    // One submission rather than two: the person has just said that something
    // broke, and the events that describe it are why they were collected.
    const kinds = sent().map((event) => event.kind);
    expect(kinds).toContain("user_report");
    expect(kinds).toContain("schema_error");
    expect(peekEvents()).toHaveLength(0);
  });

  it("comes back with an identifier and carries the request it was about", async () => {
    const reportId = await sendReport({
      message: "the downloaded file has one entry fewer than the screen showed",
      requestId: "req_8f3c19ba",
      parts: everything,
    });
    expect(reportId).toBe("rep_01J8Z3K4M5");

    const report = sent().find((event) => event.kind === "user_report");
    expect(report?.requestId).toBe("req_8f3c19ba");
    expect(report?.report?.message).toContain("one entry fewer");
    // Not attached unless the person selected it and confirmed.
    expect(report?.report?.excerpt).toBeUndefined();
  });

  it("leaves out what the person unticked, rather than sending it and hiding it", async () => {
    await sendReport({
      message: "something is wrong",
      requestId: "req_8f3c19ba",
      parts: { ...everything, release: false, route: false, requestId: false },
    });

    const report = sent().find((event) => event.kind === "user_report");
    expect(report?.release).toBe("");
    expect(report?.route).toBe("");
    expect(report?.requestId).toBeUndefined();
    // What was left ticked is still there, so the removal is the person's and
    // not a report that quietly lost half of itself.
    expect(report?.viewport.w).toBeGreaterThan(0);
  });

  it("attaches a fragment only when it was handed one", async () => {
    await sendReport({
      message: "this line is the one that breaks it",
      excerpt: "In §4 we show that",
      parts: everything,
    });

    const report = sent().find((event) => event.kind === "user_report");
    expect(report?.report?.excerpt).toBe("In §4 we show that");
  });
});

describe("nothing of a document reaches the wire", () => {
  it("sends no substring of the text, the file name or the password", async () => {
    install();

    // The shapes a leak would take: the text itself, the name of the file it
    // came from, the password that opened it, and a search somebody typed.
    const secrets = ["Chapter Four: Methodology", "thesis-final-v3.pdf", "hunter2"];

    track("extract_failed", {
      code: "PARSE_FAILED:PDF_PASSWORD_REQUIRED",
      context: { bytes: 1_204_112, pages: 340, printableRatio: 0.02 },
    });
    track("extract_suspicious", {
      code: "PARSE_FAILED:TEXT_SUSPICIOUS",
      context: { chars: 1_820_004, pages: 340 },
    });
    track("anchor_degraded", {
      code: "ANCHOR_DEGRADED:bibcheck",
      context: { relocated: 12, lost: 3, total: 418 },
    });
    await settle();

    await sendReport({
      message: "the bibliography is short by one",
      parts: {
        release: true,
        route: true,
        localeAndTheme: true,
        viewport: true,
        events: true,
        requestId: true,
      },
    });

    const body = JSON.stringify(sent());
    for (const secret of secrets) expect(body).not.toContain(secret);
    for (const word of "Chapter Four Methodology".split(" ")) {
      expect(body).not.toContain(word);
    }
  });
});
