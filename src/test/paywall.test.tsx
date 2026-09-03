// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LaunchRow } from "@/features/job/launch-row";
import { AccessDialog } from "@/features/plan/access-dialog";
import { DocumentPlan } from "@/features/plan/document-plan";
import { type BufferItem, type Entitlements, type LockReason } from "@/lib/domain";
import { defaultOptions } from "@/lib/domain";
import { capabilities, lockActionFor, paidModules } from "@/lib/entitlements";
import { drainEvents } from "@/lib/telemetry";
import { useBufferStore, useEntitlementsStore, useUiStore } from "@/stores";

import messages from "../messages/en.json";

/**
 * The paywall as a person meets it: a lock where the checks are chosen, a
 * window that says why and offers the one thing that resolves it, a line under
 * the button about access, and three refusals with three different ways out.
 *
 * None of it is tested against a story about what the server would say. Every
 * answer here is one of the four the contract writes down, so a change to what
 * the server may answer arrives as a change to these.
 */
afterEach(cleanup);

function entitlementsWith(
  overrides: Partial<Entitlements> & {
    readonly locked?: Partial<Record<string, LockReason | true>>;
  } = {},
): Entitlements {
  const locked = overrides.locked ?? {};
  const modules = Object.fromEntries(
    (["bibcheck", "glossary", "presubmit", "cite"] as const).map((id) => {
      const reason = locked[id];
      return [
        id,
        reason === undefined
          ? { allowed: true }
          : reason === true
            ? { allowed: false }
            : { allowed: false, lockReason: reason },
      ];
    }),
  );
  return {
    role: overrides.role ?? "free",
    access: overrides.access ?? false,
    ...(overrides.periodEndsAt === undefined
      ? {}
      : { periodEndsAt: overrides.periodEndsAt }),
    modules: modules as Entitlements["modules"],
  };
}

function itemWith(checks: BufferItem["checks"]): BufferItem {
  return {
    id: "doc-1",
    origin: "file",
    name: "thesis.tex",
    rawName: "thesis.tex",
    sourceSize: 40,
    sourceFormat: "tex",
    detected: "latex",
    checks,
    checksTouched: true,
    role: "manuscript",
    companions: {},
    options: defaultOptions,
    extract: {
      state: "ready",
      chars: 40,
      words: 6,
      edited: false,
      sha256: "0".repeat(64),
    },
    localFindings: [],
  };
}

function show(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  drainEvents();
  useUiStore.getState().closePaywall();
  useEntitlementsStore.getState().clear();
  useBufferStore.setState({ items: [] });
});

describe("the lock in the plan", () => {
  const paid = paidModules[0] ?? "cite";

  it("is a control that can be reached and pressed, not a greyed-out label", () => {
    useEntitlementsStore
      .getState()
      .set(entitlementsWith({ locked: { [paid]: "requires-paid" } }));
    show(<DocumentPlan item={itemWith([paid])} />);

    // A locked check keeps its place in the summary and stays in the tab order:
    // an element removed from the keyboard's reach is a check a screen reader
    // user is never told exists.
    const lock = screen.getByRole("button", { name: new RegExp(paid, "i") });
    expect(lock).toBeDefined();
    expect(lock.getAttribute("disabled")).toBeNull();
  });

  it("reports one event carrying the reason, and opens the window", () => {
    useEntitlementsStore
      .getState()
      .set(entitlementsWith({ locked: { [paid]: "trial-used" } }));
    show(<DocumentPlan item={itemWith([paid])} />);

    fireEvent.click(screen.getByRole("button", { name: new RegExp(paid, "i") }));

    const events = drainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("blocked_action");
    expect(events[0]?.code).toBe(`ACTION_BLOCKED:check.${paid}.trial-used`);
    expect(useUiStore.getState().paywallModule).toBe(paid);
  });
});

describe("the window a lock opens", () => {
  const paid = paidModules[0] ?? "cite";

  function openFor(reason: LockReason | true) {
    useEntitlementsStore.getState().set(entitlementsWith({ locked: { [paid]: reason } }));
    useUiStore.getState().openPaywall(paid);
    show(<AccessDialog />);
  }

  it("says why, in the words of the reason the server gave", () => {
    for (const reason of [
      "requires-account",
      "requires-paid",
      "trial-used",
      "period-ended",
    ] as const) {
      openFor(reason);
      const said = screen.getByTestId("lock-reason");
      expect(said.getAttribute("data-reason")).toBe(reason);
      expect(said.textContent).toBe(messages.access.reason[reason]);
      cleanup();
    }
  });

  it("offers signing in to an anonymous visitor and Pro to everybody else", () => {
    openFor("requires-account");
    expect(screen.getByTestId("lock-action").getAttribute("data-action")).toBe("sign-in");
    cleanup();

    for (const reason of ["requires-paid", "trial-used", "period-ended"] as const) {
      openFor(reason);
      expect(screen.getByTestId("lock-action").getAttribute("data-action")).toBe(
        "upgrade",
      );
      expect(lockActionFor(reason)).toBe("upgrade");
      cleanup();
    }
  });

  it("is not empty when the refusal named no reason", () => {
    // A window with a title and nothing in it reads as a broken interface, and
    // leaves the person with no idea what to do next.
    openFor(true);
    expect(screen.getByTestId("lock-reason").textContent).toBe(
      messages.access.reason.unknown,
    );
    expect(screen.getByTestId("lock-action")).toBeDefined();
  });
});

describe("the line under the button", () => {
  const paid = paidModules[0] ?? "cite";
  const free = capabilities.find(
    (capability) => capability.tier === "free" && capability.id === "bibcheck",
  );

  function launch(items: readonly BufferItem[]) {
    show(<LaunchRow items={items} pending={false} failure={null} onRun={() => {}} />);
  }

  it("is absent from a plan of free checks alone", () => {
    expect(free).toBeDefined();
    useEntitlementsStore.getState().set(entitlementsWith({ access: false }));
    launch([itemWith(["bibcheck"])]);

    // Nothing to say: the free checks have no limit for anybody, so a line
    // about access would be a line about nothing.
    expect(screen.queryByTestId("paid-access-line")).toBeNull();
  });

  it("reads `access` and not the ticks: a trial run says access is closed", () => {
    // The ordinary account: the trial run of the check is unspent, so it may be
    // ticked, while paid access is not open. A line worked out from the ticks
    // would call this open.
    useEntitlementsStore.getState().set(entitlementsWith({ access: false }));
    launch([itemWith([paid])]);

    expect(screen.getByTestId("paid-access-line").getAttribute("data-access")).toBe(
      "closed",
    );
    expect(screen.queryByTestId("paid-no-limits")).toBeNull();
  });

  it("names the end of the period when the server named one, and says so when it did not", () => {
    useEntitlementsStore
      .getState()
      .set(entitlementsWith({ access: true, periodEndsAt: "2026-08-25T00:00:00Z" }));
    launch([itemWith([paid])]);
    expect(screen.getByTestId("paid-access-line").textContent).toContain("25");
    // And the sentence that stops people from splitting a buffer into runs.
    expect(screen.getByTestId("paid-no-limits")).toBeDefined();
    cleanup();

    useEntitlementsStore.getState().set(entitlementsWith({ access: true }));
    launch([itemWith([paid])]);
    expect(screen.getByTestId("paid-access-line").textContent).toBe(
      messages.job.accessOpen,
    );
  });

  it("holds no number that the client worked out itself", () => {
    useEntitlementsStore.getState().set(entitlementsWith({ access: true }));
    launch([itemWith([paid])]);

    // Runs left, documents left, days left: none of them exist, because none of
    // them can be right on a client that does not do the spending.
    expect(screen.getByTestId("paid-access-line").textContent).not.toMatch(
      /\d+\s*(left|remaining)/i,
    );
  });
});

describe("a refusal of the run", () => {
  const failures = [
    { code: "AUTH_REQUIRED", status: 401, remedy: "sign-in" },
    { code: "ACCESS_CLOSED", status: 402, remedy: "upgrade" },
    { code: "RATE_LIMITED", status: 429, remedy: "wait", retryAfterSec: 30 },
  ] as const;

  it("gives each of the three its own way out", () => {
    for (const failure of failures) {
      show(
        <LaunchRow
          items={[itemWith(["bibcheck"])]}
          pending={false}
          failure={{ ...failure, requestId: "req_1" }}
          onRun={() => {}}
        />,
      );
      const notice = screen.getByTestId("run-failure");
      expect(notice.getAttribute("data-remedy")).toBe(failure.remedy);
      expect(notice.textContent).toContain(
        messages.errors.codes[failure.code as keyof typeof messages.errors.codes],
      );
      cleanup();
    }
  });

  it("says how long to wait when the refusal was about frequency", () => {
    show(
      <LaunchRow
        items={[itemWith(["bibcheck"])]}
        pending={false}
        failure={{
          code: "RATE_LIMITED",
          status: 429,
          requestId: "req_1",
          retryAfterSec: 30,
        }}
        onRun={() => {}}
      />,
    );
    expect(screen.getByTestId("run-failure-wait").textContent).toContain("30");
  });

  it("says nothing about what the attempt cost", () => {
    show(
      <LaunchRow
        items={[itemWith(["bibcheck"])]}
        pending={false}
        failure={{ code: "ACCESS_CLOSED", status: 402, requestId: "req_1" }}
        onRun={() => {}}
      />,
    );
    // The server does the counting, and the client is not told. "This attempt
    // was free" is exactly the claim we have no basis for.
    expect(screen.getByTestId("run-failure").textContent).not.toMatch(
      /free|refund|charged/i,
    );
  });
});
