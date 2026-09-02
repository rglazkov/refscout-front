// @vitest-environment jsdom
import * as React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExtractAnnouncement, ExtractNotice } from "@/features/buffer/extract-notice";
import { RefusalLine } from "@/features/intake/refusal-line";
import { type BufferItem, type ExtractInfo } from "@/lib/domain";
import { defaultOptions } from "@/lib/domain";

import messages from "../messages/en.json";

/**
 * One test per row of the table of parsing errors, named after the row. A row
 * without a test is a state somebody drew once and nobody has looked at since -
 * which for these states means a person stuck in front of a document that will
 * not open.
 *
 * Two things are asked of every row: that the reason is on the card, with its
 * numbers in it, and that there is a way out beside it that can be taken here.
 */
afterEach(cleanup);

function itemWith(extract: Partial<ExtractInfo>): BufferItem {
  return {
    id: "doc-1",
    origin: "file",
    name: "thesis.pdf",
    rawName: "thesis.pdf",
    sourceSize: 1024,
    sourceFormat: "pdf",
    detected: "pdf",
    checks: [],
    checksTouched: false,
    role: "manuscript",
    companions: {},
    options: defaultOptions,
    extract: {
      state: "failed",
      chars: 0,
      words: 0,
      edited: false,
      sha256: "",
      ...extract,
    },
    localFindings: [],
  };
}

function show(extract: Partial<ExtractInfo>, handlers: Partial<Handlers> = {}) {
  const item = itemWith(extract);

  const spies: Handlers = {
    onRetry: vi.fn(),
    onUnlock: vi.fn(),
    onChooseAgain: vi.fn(),
    onCancel: vi.fn(),
    onOpenText: vi.fn(),
    ...handlers,
  };

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ExtractNotice item={item} {...spies} />
    </NextIntlClientProvider>,
  );
  return spies;
}

type Handlers = {
  onRetry: () => void;
  onUnlock: (password: string) => void;
  onChooseAgain: (file: File) => void;
  onCancel: () => void;
  onOpenText: () => void;
};

function showRefusal(refusal: React.ComponentProps<typeof RefusalLine>["notice"]) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <RefusalLine notice={refusal} />
    </NextIntlClientProvider>,
  );
}

describe("intake: the rows that never reach the buffer", () => {
  it("an unsupported type says which format it was and offers a way out", () => {
    showRefusal({
      name: "slides.pptx",
      refusal: { code: "UNSUPPORTED_FORMAT", extension: "pptx" },
    });
    expect(document.body.textContent).toContain("pptx");
  });

  it("a file over the limit, or more than fifty documents, names both numbers", () => {
    showRefusal({
      name: "scan.pdf",
      refusal: {
        code: "FILE_TOO_LARGE",
        size: 220 * 1024 * 1024,
        limit: 100 * 1024 * 1024,
      },
    });
    expect(document.body.textContent).toContain("220");
    expect(document.body.textContent).toContain("100");

    cleanup();
    showRefusal({
      name: "",
      refusal: { code: "TOO_MANY_DOCUMENTS", count: 58, limit: 50 },
    });
    expect(document.body.textContent).toContain("58");
    expect(document.body.textContent).toContain("50");
  });
});

describe("reading: the file itself", () => {
  it("a file that cannot be read keeps its card and offers another attempt", () => {
    const spies = show({ state: "failed", errorCode: "FILE_UNREADABLE" });
    expect(screen.getByTestId("extract-notice")).toHaveProperty(
      "dataset.extractCode",
      "FILE_UNREADABLE",
    );
    screen.getByTestId("retry-extract").click();
    expect(spies.onRetry).toHaveBeenCalled();
    // And the second way out of the same row: choose the file again.
    expect(screen.getByTestId("choose-again")).not.toBeNull();
  });
});

describe("reading: PDF", () => {
  it("a protected PDF asks for its password on the card", () => {
    show({ state: "needs-password", errorCode: "PDF_PASSWORD_REQUIRED" });
    const field = screen.getByTestId("pdf-password");
    expect(field).toHaveProperty("type", "password");
    expect(screen.getByTestId("unlock-pdf")).not.toBeNull();
    // Said plainly, because it is the question a person asks first.
    expect(document.body.textContent).toContain("travels nowhere");
  });

  it("a wrong password says so and asks again", () => {
    show({ state: "needs-password", errorCode: "PDF_PASSWORD_WRONG" });
    expect(document.body.textContent).toContain("did not open");
    expect(screen.getByTestId("pdf-password")).not.toBeNull();
  });

  it("a damaged PDF gives a code, another attempt and the text by hand", () => {
    const spies = show({ state: "failed", errorCode: "PDF_CORRUPT" });
    expect(screen.getByTestId("retry-extract")).not.toBeNull();
    screen.getByTestId("type-text-in").click();
    expect(spies.onOpenText).toHaveBeenCalled();
  });

  it("a document with no text layer says the pages are images", () => {
    show({ state: "empty", errorCode: "NO_TEXT_LAYER", errorParams: { pages: 34 } });
    expect(document.body.textContent).toContain("No text found");
    // No "try again": reading it a second time would give the same nothing.
    expect(screen.queryByTestId("retry-extract")).toBeNull();
    expect(screen.getByTestId("type-text-in")).not.toBeNull();
  });

  it("a document some of whose pages failed says which ones", () => {
    show({
      state: "partial",
      errorCode: "PAGES_MISSING",
      chars: 40_000,
      pages: 60,
      pagesParsed: 47,
      missingPages: [12, 13, 51],
    });
    expect(document.body.textContent).toContain("47 of 60");
    expect(document.body.textContent).toContain("12, 13, 51");
  });
});

describe("reading: Word", () => {
  it("a container that will not open offers PDF or the text by hand", () => {
    show({ state: "failed", errorCode: "DOCX_UNREADABLE" });
    expect(document.body.textContent).toContain("Save it as PDF");
    expect(screen.getByTestId("type-text-in")).not.toBeNull();
  });

  it("a conversion that gave nothing is the same outcome as a scan", () => {
    show({ state: "empty", errorCode: "DOCX_EMPTY" });
    expect(document.body.textContent).toContain("held no text");
  });

  it("an archive past a ceiling prints the numbers", () => {
    show({
      state: "failed",
      errorCode: "ARCHIVE_TOO_MANY_ENTRIES",
      errorParams: { entries: 1201, limit: 1000 },
    });
    expect(document.body.textContent).toContain("1,201");
    expect(document.body.textContent).toContain("1,000");

    cleanup();
    show({
      state: "failed",
      errorCode: "ARCHIVE_ENTRY_TOO_LARGE",
      errorParams: { bytes: 209_715_200, limit: 157_286_400 },
    });
    expect(document.body.textContent).toContain("209,715,200");

    // The total is its own ceiling with its own number. Reported as the entry's,
    // it read as a small part having passed a large limit.
    cleanup();
    show({
      state: "failed",
      errorCode: "ARCHIVE_TOTAL_TOO_LARGE",
      errorParams: { unpacked: 314_572_800, limit: 314_572_800 },
    });
    expect(document.body.textContent).toContain("314,572,800");
    expect(document.body.textContent).toContain("together");

    cleanup();
    show({
      state: "failed",
      errorCode: "ARCHIVE_RATIO_TOO_HIGH",
      errorParams: { unpacked: 800_000_000, packed: 2_000, limit: 200 },
    });
    expect(document.body.textContent).toContain("800,000,000");
    expect(document.body.textContent).toContain("2,000");
  });
});

describe("quality of the text", () => {
  it("a text file in an unknown encoding says the text came out badly", () => {
    const spies = show({
      state: "suspicious",
      chars: 4_000,
      errorCode: "TEXT_BAD_ENCODING",
      errorParams: { printableRatio: 0.62, replacements: 480 },
    });
    expect(document.body.textContent).toContain("replacement characters are visible");
    // The way out here is the editor, and the label says so: there is text to
    // correct, and telling a person to retype it would be an insult.
    screen.getByTestId("type-text-in").click();
    expect(spies.onOpenText).toHaveBeenCalled();
    expect(screen.getByTestId("type-text-in").textContent).toContain("Open and correct");
  });

  it("text that is empty or rubbish asks to be read before the check runs", () => {
    show({ state: "suspicious", chars: 900, errorCode: "TEXT_SUSPICIOUS" });
    expect(document.body.textContent).toContain("read it before the check runs");

    cleanup();
    show({ state: "empty", errorCode: "TEXT_EMPTY" });
    expect(document.body.textContent).toContain("Nothing was extracted");
  });
});

describe("the worker", () => {
  it("a parse under way shows how far it has got and a button that stops it", () => {
    const spies = show({ state: "extracting" }, {});
    expect(screen.getByTestId("extract-progress")).not.toBeNull();
    screen.getByTestId("cancel-extract").click();
    expect(spies.onCancel).toHaveBeenCalled();
  });

  it("a parse that ran out of time ends as an error with a way out", () => {
    const spies = show({ state: "failed", errorCode: "WORKER_TIMEOUT" });
    expect(document.body.textContent).toContain("took too long");
    screen.getByTestId("retry-extract").click();
    expect(spies.onRetry).toHaveBeenCalled();
  });

  it("a parse that was stopped can be started again", () => {
    show({ state: "failed", errorCode: "CANCELLED" });
    expect(screen.getByTestId("retry-extract")).not.toBeNull();
  });
});

describe("every failure has a way out", () => {
  /**
   * The rule stated once over the whole table rather than row by row: a state
   * with no way out is a person stuck in front of the only copy of their
   * manuscript, and it is the one thing none of these states may be.
   */
  const codes = [
    "FILE_UNREADABLE",
    "PDF_PASSWORD_REQUIRED",
    "PDF_PASSWORD_WRONG",
    "PDF_CORRUPT",
    "NO_TEXT_LAYER",
    "DOCX_UNREADABLE",
    "DOCX_EMPTY",
    "ARCHIVE_TOO_MANY_ENTRIES",
    "ARCHIVE_ENTRY_TOO_LARGE",
    "ARCHIVE_TOTAL_TOO_LARGE",
    "ARCHIVE_RATIO_TOO_HIGH",
    "TEXT_EMPTY",
    "TEXT_SUSPICIOUS",
    "TEXT_BAD_ENCODING",
    "PAGES_MISSING",
    "WORKER_TIMEOUT",
    "WORKER_CRASHED",
    "CANCELLED",
  ] as const;

  it.each(codes)("%s says what happened and offers something to do", (code) => {
    const password = code === "PDF_PASSWORD_REQUIRED" || code === "PDF_PASSWORD_WRONG";
    show({
      state: password ? "needs-password" : "failed",
      errorCode: code,
      errorParams: { entries: 1, limit: 1, bytes: 1, unpacked: 1, packed: 1 },
    });
    expect(document.body.textContent?.trim().length ?? 0).toBeGreaterThan(20);
    const wayOut = password
      ? screen.queryByTestId("unlock-pdf")
      : screen.queryByTestId("type-text-in");
    expect(wayOut).not.toBeNull();
  });
});

/**
 * The two things a person who cannot see the card is owed: to be told that the
 * parse is running and that it has ended, and to see where the keyboard is when
 * it lands in the one field on this card.
 */
describe("reading a document without seeing it", () => {
  function announce(extract: Partial<ExtractInfo>): string {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ExtractAnnouncement item={itemWith(extract)} />
      </NextIntlClientProvider>,
    );
    const region = screen.getByTestId("extract-announcement");
    expect(region.getAttribute("aria-live")).toBe("polite");
    return region.textContent ?? "";
  }

  it("says that the parse started and that it finished", () => {
    expect(announce({ state: "extracting" })).toContain("Reading thesis.pdf");

    cleanup();
    // The ending nothing else reports: a document that read cleanly leaves no
    // notice on the card at all.
    expect(announce({ state: "ready", chars: 120_000 })).toContain("120,000");
  });

  it("says that a protected document is waiting for a password", () => {
    expect(announce({ state: "needs-password" })).toContain("password field");
  });

  it("stays silent where the visible line already interrupts", () => {
    // `role="alert"` on the reason speaks on its own; a second region over the
    // same event is the sentence twice.
    expect(announce({ state: "failed", errorCode: "PDF_CORRUPT" })).toBe("");

    cleanup();
    expect(announce({ state: "empty", errorCode: "TEXT_EMPTY" })).toBe("");
  });

  it("shows the keyboard where it is in the password field", () => {
    show({ state: "needs-password", errorCode: "PDF_PASSWORD_REQUIRED" });
    const box = screen.getByTestId("pdf-password").parentElement;
    // The field itself draws no outline, so the box around it has to: without
    // this the focus is on the card and invisible.
    expect(box?.className).toContain("focus-within:ring-[3px]");
    expect(box?.className).toContain("focus-within:border-ring");
  });
});
