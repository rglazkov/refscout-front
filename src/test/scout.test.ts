import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { scoutFeedback, scoutSearch } from "@/lib/api";
import { type ScoutRecord } from "@/lib/domain";
import { arrange, noFilters } from "@/features/scout/filters";
import { drainEvents, peekEvents } from "@/lib/telemetry";

import { handlers } from "./msw/handlers";

/**
 * What a search sends, and what it works out for itself.
 *
 * Two claims are made about this screen and both are checked here rather than
 * remembered. A search sends the query string and nothing else - the person
 * wrote it, so it never appears in telemetry - and the order and narrowing of
 * the answer are the browser's work, so changing a filter reaches no server at
 * all.
 */
const requests: { readonly url: string; readonly body: string }[] = [];

const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  server.events.on("request:start", ({ request }) => {
    void request
      .clone()
      .text()
      .then((body) => requests.push({ url: request.url, body }));
  });
});
beforeEach(() => {
  requests.length = 0;
  drainEvents();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const QUERY = "transformer attention benchmark";

function record(over: Partial<ScoutRecord> = {}): ScoutRecord {
  return {
    resultId: "r1",
    title: "A paper",
    authors: ["Vaswani, A."],
    openAccess: false,
    sources: ["arxiv"],
    ...over,
  };
}

describe("a search", () => {
  it("asks for the query and the one option, and comes back with what answered", async () => {
    const answer = await scoutSearch(QUERY, 25, "en");

    expect(answer.results.length).toBeGreaterThan(0);
    expect(answer.searchedSources.length).toBeGreaterThan(0);
    // The example the contract carries has a database that timed out, which is
    // the case the interface has to say out loud.
    expect(answer.degraded.length).toBeGreaterThan(0);

    const sent = JSON.parse(requests[0]?.body ?? "{}") as Record<string, unknown>;
    expect(sent).toEqual({ query: QUERY, limit: 25, locale: "en" });
  });

  it("puts the query in nothing that is collected", async () => {
    await scoutSearch(QUERY, 10, "en");
    await scoutFeedback("res_1", "up");

    const collected = JSON.stringify(peekEvents());
    for (const word of QUERY.split(" ")) expect(collected).not.toContain(word);

    // The thumb carries the record and the direction, and no question.
    const feedback = requests.find((sent) => sent.url.includes("/scout/feedback"));
    expect(JSON.parse(feedback?.body ?? "{}")).toEqual({
      resultId: "res_1",
      vote: "up",
    });
  });

  it("answers a question nothing matches with an empty list rather than a failure", async () => {
    const answer = await scoutSearch("chrysanthemum husbandry", 10, "en");
    expect(answer.results).toEqual([]);
    expect(answer.searchedSources.length).toBeGreaterThan(0);
  });
});

describe("the order and the filters are the browser's work", () => {
  const results = [
    record({
      resultId: "a",
      title: "Old and cited",
      year: 1999,
      citedBy: 900,
      relevance: 0.2,
      doi: "10.1000/old",
      doiVerified: true,
    }),
    record({
      resultId: "b",
      title: "New and open",
      year: 2024,
      citedBy: 4,
      relevance: 0.9,
      openAccess: true,
      venue: "ICLR",
      authors: ["Tay, Y."],
      doi: "10.1000/new",
    }),
  ];

  it("changing a filter or the order sends no request", async () => {
    await scoutSearch(QUERY, 10, "en");
    const after = requests.length;

    expect(arrange(results, { ...noFilters, openAccessOnly: true }, "year")).toHaveLength(
      1,
    );
    expect(arrange(results, { ...noFilters, minCitations: "100" }, "citations")).toEqual([
      results[0],
    ]);
    expect(arrange(results, { ...noFilters, author: "tay" }, "relevance")).toEqual([
      results[1],
    ]);
    expect(arrange(results, { ...noFilters, venue: "iclr" }, "relevance")).toEqual([
      results[1],
    ]);
    // A DOI in the field is not a DOI anybody resolved, and the filter is about
    // the check rather than the field.
    expect(arrange(results, { ...noFilters, withDoiOnly: true }, "relevance")).toEqual([
      results[0],
    ]);
    expect(arrange(results, { ...noFilters, yearFrom: "2000" }, "relevance")).toEqual([
      results[1],
    ]);

    expect(requests.length).toBe(after);
  });

  it("each order puts a different record first", () => {
    expect(arrange(results, noFilters, "relevance")[0]?.resultId).toBe("b");
    expect(arrange(results, noFilters, "year")[0]?.resultId).toBe("b");
    expect(arrange(results, noFilters, "citations")[0]?.resultId).toBe("a");
  });

  it("leaves the answer it was given alone", () => {
    const original = [...results];
    arrange(results, noFilters, "citations");
    expect(results).toEqual(original);
  });
});
