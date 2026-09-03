// @vitest-environment jsdom
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { NextIntlClientProvider } from "next-intl";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AccountScreen } from "@/features/auth/account-screen";
import { SessionNotice } from "@/features/auth/session-notice";
import { ApiError, setCsrfToken } from "@/lib/api";
import { docRegistry } from "@/lib/docs";
import { type BufferItem, defaultOptions } from "@/lib/domain";
import { useBufferStore, useJobStore } from "@/stores";

import { handlers, resetMockServer, setAccessScenario } from "./msw/handlers";
import messages from "../messages/en.json";

/**
 * The account screen: the way in, the two payment links, and the two ways out -
 * signing out of this browser, and deleting the account on the server.
 *
 * Two of the claims here are about the manuscripts rather than about the
 * account. Leaving for somebody else's domain loses the buffer while there is
 * no storage that survives a reload, so it is asked about before it happens;
 * and signing out clears the browser, because the reason to sign out is a
 * shared computer where the next person must not find the text of an
 * unpublished thesis.
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
  useJobStore.getState().reset();
});

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <QueryClientProvider client={client}>
        <AccountScreen />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return client;
}

function showNotice(error: unknown) {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <SessionNotice error={error} />
    </NextIntlClientProvider>,
  );
}

function failure(code: string, status: number) {
  return new ApiError({ code, requestId: "req_1", status });
}

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

describe("signed out", () => {
  beforeEach(() => setAccessScenario("anonymous"));

  it("offers the three providers and no password field", async () => {
    show();

    for (const provider of ["google", "github", "orcid"]) {
      expect(await screen.findByTestId(`sign-in-${provider}`)).toBeDefined();
    }
    // A password field here would be a field the product does not have: the
    // reset flow lives on the server, and the admin panel is another build.
    expect(document.querySelector("input[type=password]")).toBeNull();
  });

  it("asks before leaving with documents in the buffer", async () => {
    fillBuffer();
    show();

    fireEvent.click(await screen.findByTestId("sign-in-google"));

    // The browser has not gone anywhere: leaving means coming back to a fresh
    // page, and the extracted text is the only copy of the document there is.
    const asked = await screen.findByTestId("leaving-site");
    expect(asked.textContent).toContain("1 document");
    expect(docRegistry.get("doc-1")).toBeDefined();
  });
});

describe("signed in", () => {
  it("names the account and the state of access", async () => {
    show();
    expect((await screen.findByTestId("account-email")).textContent).toBe(
      "j.smith@example.edu",
    );
    await waitFor(() =>
      expect(screen.getByTestId("account-access").getAttribute("data-access")).toBe(
        "open",
      ),
    );
  });

  it("clears this browser on the way out", async () => {
    fillBuffer();
    const client = show();
    await client.fetchQuery({ queryKey: ["probe"], queryFn: () => "kept" });

    fireEvent.click(await screen.findByTestId("account-sign-out"));

    // The texts, the buffer and every cached answer. On a shared computer this
    // is the whole point of the button.
    await waitFor(() => expect(useBufferStore.getState().items).toEqual([]));
    expect(docRegistry.get("doc-1")).toBeUndefined();
    expect(client.getQueryData(["probe"])).toBeUndefined();

    // And the screen follows the server rather than the last answer it was
    // handed: the way back in is what is on it now.
    expect(await screen.findByTestId("sign-in-google")).toBeDefined();
  });

  it("asks before deleting the account, and says what goes", async () => {
    show();
    fireEvent.click(await screen.findByTestId("account-delete"));

    // A question with two answers in a dialogue, not a strip unfolding under a
    // button that can be scrolled past.
    const dialog = await screen.findByTestId("delete-account");
    expect(dialog.textContent).toContain(messages.account.deleteBody);

    fireEvent.click(screen.getByTestId("confirm-destructive"));
    await waitFor(() => expect(useBufferStore.getState().items).toEqual([]));
  });
});

describe("a session that ends in the middle of the work", () => {
  it("offers the way back in for the two shapes an ended session has", () => {
    // Not signed in any more, and a token that no longer matches the cookie:
    // both are the session rather than the request, and both are answered with
    // an invitation rather than with a code on an empty screen.
    for (const error of [failure("AUTH_REQUIRED", 401), failure("CSRF_INVALID", 403)]) {
      showNotice(error);
      expect(screen.getByTestId("session-expired")).toBeDefined();
      cleanup();
    }
  });

  it("says nothing about a failure that is not the session's", () => {
    showNotice(failure("INTERNAL_ERROR", 500));
    expect(screen.queryByTestId("session-expired")).toBeNull();
  });
});
