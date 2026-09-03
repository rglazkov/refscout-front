import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  ApiError,
  deleteAccount,
  exportAccountData,
  getEntitlements,
  getSession,
  oauthStartUrl,
  openBillingPortal,
  setCsrfToken,
  signOut,
  startCheckout,
  submitJob,
} from "@/lib/api";
import { buildSubmission, docRegistry } from "@/lib/docs";
import { type BufferItem, defaultOptions } from "@/lib/domain";
import { useBufferStore } from "@/stores";

import { handlers, resetMockServer, setAccessScenario } from "./msw/handlers";

/**
 * Access, the session and the account against the second data source.
 *
 * Everything here is a claim about what the server decides and the client only
 * relays: that a paid module is refused whatever the browser believes, that the
 * two fields of the entitlements answer are read apart, and that signing in and
 * paying are redirects to addresses we do not build ourselves. The stand is the
 * mock built from the contract, so these hold before the real server exists and
 * are the scenarios it will be pointed at when it does.
 */
const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  resetMockServer();
  setCsrfToken(null);
  docRegistry.clear();
});

describe("the two fields of the entitlements answer", () => {
  it("are read apart: a trial run is allowed while access is closed", async () => {
    setAccessScenario("trial");
    const entitlements = await getEntitlements();

    // The ordinary case for a registered account, and the reason neither field
    // may be worked out from the other.
    expect(entitlements.modules.cite.allowed).toBe(true);
    expect(entitlements.access).toBe(false);
  });

  it("name a reason whenever a module is closed", async () => {
    setAccessScenario("periodEnded");
    const entitlements = await getEntitlements();

    expect(entitlements.modules.cite.allowed).toBe(false);
    expect(entitlements.modules.cite.lockReason).toBe("period-ended");
    // The free checks stay open for everybody, including a spent account.
    expect(entitlements.modules.bibcheck.allowed).toBe(true);
  });
});

describe("a paid module without access", () => {
  async function runCite() {
    const item: BufferItem = {
      id: "doc-1",
      origin: "paste",
      name: "thesis.tex",
      rawName: "thesis.tex",
      sourceSize: 12,
      sourceFormat: "tex",
      detected: "latex",
      checks: ["cite"],
      checksTouched: true,
      role: "manuscript",
      companions: {},
      options: defaultOptions,
      extract: {
        state: "ready",
        chars: 12,
        words: 2,
        edited: false,
        sha256: "0".repeat(64),
      },
      localFindings: [],
    };
    docRegistry.put(item.id, {
      text: "A claim here",
      originalSha256: "0".repeat(64),
      hadBom: false,
      eol: "\n",
    });
    const submission = await buildSubmission([item], "en");
    if (submission === null) throw new Error("nothing to submit");
    return await submitJob(submission.request, { idempotencyKey: "key-1" });
  }

  it("is refused whole, whatever the browser believed", async () => {
    // The interface would have drawn a lock here. This is the same submission
    // made with the lock gone - a cleared store, a private window, a direct
    // call - and the answer is the server's, not the interface's.
    setAccessScenario("periodEnded");
    const before = useBufferStore.getState().items;

    await expect(runCite()).rejects.toMatchObject({
      failure: { code: "ACCESS_CLOSED", status: 402 },
    });

    // Rights are checked before any module starts, so nothing ran and nothing
    // moved: the buffer and the ticks are where the person left them, and the
    // choice in front of them is to drop the paid check or to open access.
    expect(useBufferStore.getState().items).toBe(before);
    expect(docRegistry.get("doc-1")).toBeDefined();
  });

  it("is refused as a sign-in when nobody is signed in", async () => {
    setAccessScenario("anonymous");

    await expect(runCite()).rejects.toMatchObject({
      failure: { code: "AUTH_REQUIRED", status: 401 },
    });
  });

  it("runs when access is open", async () => {
    setAccessScenario("paid");
    const created = await runCite();
    expect(created.jobId).not.toBe("");
  });
});

describe("the session", () => {
  it("is fetched before anything else and installs the CSRF token", async () => {
    const session = await getSession();
    expect(session.user?.email).toBe("j.smith@example.edu");

    // The proof that the token was installed rather than merely returned: the
    // next mutating request carries it.
    const sent: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const token = request.headers.get("X-CSRF-Token");
      if (token !== null) sent.push(token);
    });
    await startCheckout("pro");
    expect(sent).toContain(session.csrfToken);
    server.events.removeAllListeners();
  });

  it("is anonymous without failing", async () => {
    setAccessScenario("anonymous");
    await expect(getSession()).resolves.toMatchObject({ user: null });
  });
});

describe("the way out of the site", () => {
  it("returns to a path on this site and nothing else", () => {
    expect(oauthStartUrl("google", "/en/")).toContain("next=%2Fen%2F");

    // Every one of these is an address that leaves: a protocol-relative URL, a
    // scheme, and the backslash some browsers read as a separator. An unchecked
    // return parameter on a sign-in address is a phishing page that genuinely
    // starts on our domain.
    for (const hostile of [
      "//evil.example/",
      "https://evil.example/",
      "/\\evil.example/",
      "javascript:alert(1)",
    ]) {
      expect(oauthStartUrl("github", hostile)).toMatch(/next=%2F$/);
    }
  });
});

describe("account chores", () => {
  it("hands back the payment provider's address rather than a form", async () => {
    await expect(startCheckout("pro")).resolves.toMatch(/^https:\/\//);
    await expect(openBillingPortal()).resolves.toMatch(/^https:\/\//);
  });

  it("exports what the server holds and deletes on request", async () => {
    await expect(exportAccountData()).resolves.toMatchObject({
      account: { email: "j.smith@example.edu" },
    });
    await expect(deleteAccount()).resolves.toBeUndefined();
  });

  it("refuses both to an anonymous principal", async () => {
    setAccessScenario("anonymous");
    await expect(exportAccountData()).rejects.toBeInstanceOf(ApiError);
    await expect(deleteAccount()).rejects.toBeInstanceOf(ApiError);
  });

  it("drops the CSRF token on the way out", async () => {
    await getSession();
    await signOut();

    const sent: Array<string | null> = [];
    server.events.on("request:start", ({ request }) => {
      sent.push(request.headers.get("X-CSRF-Token"));
    });
    // Anonymous now, so this is refused - but the point is the header, which
    // must no longer be the token of a session that has ended.
    await expect(deleteAccount()).rejects.toBeInstanceOf(ApiError);
    expect(sent).toEqual([null]);
    server.events.removeAllListeners();
  });
});
