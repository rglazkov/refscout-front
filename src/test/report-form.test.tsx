// @vitest-environment jsdom
import "fake-indexeddb/auto";

import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ReportProblem } from "@/features/feedback/report-problem";
import { clearCollected, track } from "@/lib/telemetry";
import { useReportStore } from "@/stores";

import messages from "../messages/en.json";
import { deliveredEvents, handlers, resetMockServer } from "./msw/handlers";

/**
 * The form somebody writes a report in.
 *
 * The claim it exists to keep is not "a report can be sent" but "the person
 * sees what is about to be sent about them, and what they take out is not
 * sent". For a product that works with unpublished manuscripts that is a
 * condition of trust rather than a nicety, so it is checked here against the
 * body that actually left rather than against the list on the screen.
 */
const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetMockServer();
  clearCollected();
  useReportStore.getState().closeReport();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function show(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );
}

function sentReport() {
  return (deliveredEvents() as { kind: string; release: string; route: string }[]).find(
    (event) => event.kind === "user_report",
  );
}

describe("reporting a problem", () => {
  it("opens from the footer and from the keyboard", async () => {
    show(<ReportProblem />);

    fireEvent.click(screen.getByTestId("report-problem"));
    expect(await screen.findByTestId("report-dialog")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(useReportStore.getState().open).toBe(false));

    // The combination works wherever the person is: a screen that is wrong in a
    // way no exception describes has to be reportable without hunting for a
    // control.
    fireEvent.keyDown(window, { code: "KeyR", altKey: true, shiftKey: true });
    expect(useReportStore.getState().open).toBe(true);
  });

  it("lists what will be sent, and leaves out what was unticked", async () => {
    track("schema_error", { code: "SCHEMA_MISMATCH:job.documents[0]" });
    show(<ReportProblem />);
    fireEvent.click(screen.getByTestId("report-problem"));
    await screen.findByTestId("report-dialog");

    // Every field is on screen with the value it holds, including the events
    // already collected: "we sent something about your session" and "here is
    // exactly what we will send" are conversations of different quality.
    for (const part of ["release", "route", "localeAndTheme", "viewport", "events"]) {
      expect(screen.getByTestId(`report-part-${part}`)).toBeDefined();
    }
    expect(screen.getByText(/schema_error/)).toBeDefined();

    fireEvent.click(screen.getByTestId("report-part-release"));
    fireEvent.change(screen.getByTestId("report-message"), {
      target: { value: "the downloaded file is one entry short" },
    });
    fireEvent.click(screen.getByTestId("report-send"));

    // The identifier of the case stays on screen: it is what the person quotes
    // to support, and support finds the case by it.
    expect((await screen.findByTestId("report-id")).textContent).toBe("rep_01J8Z3K4M5");

    const report = sentReport();
    expect(report?.release).toBe("");
    expect(report?.route).not.toBe("");
  });

  it("attaches nothing of the document unless the person selected it", async () => {
    show(<ReportProblem />);
    fireEvent.click(screen.getByTestId("report-problem"));
    await screen.findByTestId("report-dialog");

    // Nothing is selected, so there is no offer to attach anything at all.
    expect(screen.queryByTestId("report-excerpt")).toBeNull();
  });
});
