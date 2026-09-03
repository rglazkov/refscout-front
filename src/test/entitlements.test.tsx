// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LaunchRow } from "@/features/job/launch-row";
import { AccessDialog } from "@/features/plan/access-dialog";
import {
  type BufferItem,
  type Entitlements,
  defaultOptions,
  moduleIds,
} from "@/lib/domain";
import {
  capabilities,
  isPaidModule,
  lockActionFor,
  paidModules,
  planPrice,
} from "@/lib/entitlements";
import { useEntitlementsStore, useUiStore } from "@/stores";

import messages from "../messages/en.json";

/**
 * One table of rights, read by three places.
 *
 * The pricing page, the lock on a check and the window the lock opens all say
 * where the paid boundary runs. Written out three times they agree until the
 * first change of plan, and the disagreement is found by whoever is paying - so
 * each of the three is checked here against the table rather than against a
 * list repeated in the test.
 */
afterEach(cleanup);

function open(access: boolean): Entitlements {
  return {
    role: "paid",
    access,
    modules: Object.fromEntries(
      moduleIds.map((id) => [id, { allowed: true }]),
    ) as Entitlements["modules"],
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
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  useEntitlementsStore.getState().clear();
  useUiStore.getState().closePaywall();
});

describe("the pricing page", () => {
  it("lists exactly what the table lists", () => {
    // The page maps over the table, so its lines and the table's entries are
    // the same set: an entry added without a line of its own fails here, and a
    // line left behind after an entry goes fails the dictionary test.
    expect(Object.keys(messages.pricingPlan).sort()).toEqual(
      capabilities.map((capability) => capability.id).sort(),
    );
  });

  it("takes the price from the table rather than from the wording", () => {
    // A figure typed into a sentence is a second price, and the one a crawler
    // is given would go on quoting it after the real one changed.
    expect(typeof planPrice.amount).toBe("number");
    expect(JSON.stringify(messages.pricing)).not.toMatch(/[$€£]\s?\d/);
  });

  it("names the unlimited checks from the table rather than in its own words", () => {
    // The sentence takes the list as a substitution. Spelled out in the
    // dictionary, it would go on naming a check the day that check stops being
    // free, and nothing would point at it.
    expect(messages.pricing.planNote).toContain("{free}");
    for (const { id } of capabilities) {
      const name = messages.capabilities[id as keyof typeof messages.capabilities];
      if (name !== undefined) expect(messages.pricing.planNote).not.toContain(name);
    }
  });
});

describe("the launch row", () => {
  it("shows the access line for exactly the checks the table calls paid", () => {
    // Every module, against the table - so a list of paid modules written out
    // again inside the row would disagree with the table the moment one of them
    // moved, and would disagree here first.
    for (const check of moduleIds) {
      useEntitlementsStore.getState().set(open(true));
      show(
        <LaunchRow
          items={[itemWith([check])]}
          pending={false}
          failure={null}
          onRun={() => {}}
        />,
      );
      const line = screen.queryByTestId("paid-access-line");
      expect(line === null).toBe(!isPaidModule(check));
      cleanup();
    }
  });
});

describe("the window a lock opens", () => {
  it("takes its action from the table", () => {
    const paid = paidModules[0] ?? "cite";
    useEntitlementsStore.getState().set({
      ...open(false),
      modules: {
        ...open(false).modules,
        [paid]: { allowed: false, lockReason: "requires-account" },
      },
    });
    useUiStore.getState().openPaywall(paid);
    show(<AccessDialog />);

    expect(screen.getByTestId("lock-action").getAttribute("data-action")).toBe(
      lockActionFor("requires-account"),
    );
  });
});
