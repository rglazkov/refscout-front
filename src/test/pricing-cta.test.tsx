// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { setupServer } from "msw/node";
import { NextIntlClientProvider } from "next-intl";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { UpgradeCta } from "@/features/auth/upgrade-cta";
import { setCsrfToken } from "@/lib/api";
import { docRegistry } from "@/lib/docs";
import { type BufferItem, defaultOptions } from "@/lib/domain";
import { useBufferStore } from "@/stores";

import { handlers, resetMockServer, setAccessScenario } from "./msw/handlers";
import messages from "../messages/en.json";

/**
 * The button on the pricing card. It is the end of the offer, so the errand it
 * starts has to match the person pressing it: signing in and paying are
 * different things, and someone who has already paid is not buying again.
 */
const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

beforeEach(() => {
  resetMockServer();
  setCsrfToken(null);
  docRegistry.clear();
  useBufferStore.setState({ items: [] });
});

function show() {
  // No query client is handed in: the control brings its own, because the page
  // it stands on must not download one before its text can be read.
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <UpgradeCta />
    </NextIntlClientProvider>,
  );
}

/** One document, so that leaving the site is a question rather than a departure. */
function fillBuffer() {
  const item: BufferItem = {
    id: "doc-1",
    origin: "file",
    name: "thesis.tex",
    rawName: "thesis.tex",
    sourceSize: 40,
    sourceFormat: "tex",
    detected: "latex",
    checks: ["bibcheck"],
    checksTouched: false,
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
  docRegistry.put(item.id, {
    text: "The only copy of this text in existence.",
    originalSha256: "0".repeat(64),
    hadBom: false,
    eol: "\n",
  });
  useBufferStore.setState({ items: [item] });
}

describe("the pricing card's button", () => {
  it("offers the way in to somebody who has not signed in", async () => {
    // A payment form is not what an anonymous visitor needs: they cannot
    // complete one, and the account is where the providers are.
    setAccessScenario("anonymous");
    show();

    const link = await screen.findByTestId("pricing-sign-in");
    expect(link.getAttribute("href")).toMatch(/^\/account\/?$/);
    expect(screen.queryByTestId("pricing-billing")).toBeNull();
  });

  it("buys access for somebody whose access is closed", async () => {
    setAccessScenario("periodEnded");
    fillBuffer();
    show();

    // The label follows the server's answer, so the wait is for the answer.
    const button = await screen.findByRole("button", { name: "Connect Pro" });
    expect(button.dataset.access).toBe("closed");

    fireEvent.click(button);

    // The provider's address came back and the browser has not gone anywhere
    // yet: leaving means coming back to a fresh page, and the extracted text is
    // the only copy of the document there is.
    const asked = await screen.findByTestId("leaving-site");
    expect(asked.textContent).toContain("1 document");
    expect(docRegistry.get("doc-1")).toBeDefined();
  });

  it("manages the subscription of somebody who has already bought one", async () => {
    setAccessScenario("paid");
    fillBuffer();
    show();

    const button = await screen.findByRole("button", { name: "Manage subscription" });
    expect(button.dataset.access).toBe("open");

    fireEvent.click(button);
    expect(await screen.findByTestId("leaving-site")).toBeDefined();
  });
});
