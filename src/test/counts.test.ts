import { describe, expect, it } from "vitest";

import { toJobStatus, toModuleResult } from "@/lib/api/mappers";
import { zJobStatus, zModuleResult } from "@/lib/api/wire/zod.gen";
import { type Job, moduleIds, resultKey } from "@/lib/domain";
import {
  addCounts,
  countIssues,
  documentCounts,
  issuesOf,
  jobCounts,
  verifyCounts,
} from "@/lib/normalize";

import { scenarios } from "./msw/handlers.gen";

/**
 * The arithmetic of the results screen. The document row equals the sum of its
 * cards and the top row equals the sum of the document rows, and both rest on
 * one rule: exactly two categories are added up. `info` takes part nowhere -
 * Cite's claims arrive as `info`, its card says "12 claims", and its severity
 * counters stay at zero.
 *
 * A screen whose heading and whose cards name different numbers is the first
 * thing a person notices and the last thing they trust afterwards, so this is a
 * test rather than a property of careful markup.
 */
function jobFrom(name: "finished" | "partial"): Job {
  const status = toJobStatus(zJobStatus.parse(scenarios.getJob[name].body));
  const bibcheck = toModuleResult(
    zModuleResult.parse(scenarios.getModuleResult.bibcheck.body),
  );
  return {
    status,
    token: "tok",
    results: { [resultKey(bibcheck.docId, "bibcheck")]: bibcheck },
  };
}

describe("the counters add up", () => {
  it("the top row is the sum of the document rows", () => {
    for (const name of ["finished", "partial"] as const) {
      const job = jobFrom(name);
      const summed = job.status.documents
        .map((document) => documentCounts(document.modules))
        .reduce(addCounts, { critical: 0, warning: 0, info: 0 });
      expect(jobCounts(job)).toEqual(summed);
    }
  });

  it("a document row is the sum of the cards that are on screen", () => {
    const job = jobFrom("partial");
    for (const document of job.status.documents) {
      const onScreen = moduleIds
        .map((moduleId) => document.modules[moduleId])
        .filter(
          (status) =>
            status !== undefined &&
            status.state !== "queued" &&
            status.state !== "running",
        );
      const summed = onScreen.reduce(
        (total, status) =>
          addCounts(total, status?.counts ?? { critical: 0, warning: 0, info: 0 }),
        { critical: 0, warning: 0, info: 0 },
      );
      expect(documentCounts(document.modules)).toEqual(summed);
    }
  });

  it("a module still running contributes nothing, because its card is not there yet", () => {
    // A heading that reported checks which have not arrived would name a number
    // the page does not contain, and the first thing a person does is count the
    // cards.
    const counts = documentCounts({
      bibcheck: {
        state: "ok",
        attempt: 1,
        score: 64,
        counts: { critical: 1, warning: 1, info: 0 },
      },
      cite: {
        state: "running",
        attempt: 1,
        score: null,
        counts: { critical: 9, warning: 9, info: 9 },
      },
    });
    expect(counts).toEqual({ critical: 1, warning: 1, info: 0 });
  });
});

describe("the body and the counters have to agree", () => {
  const result = toModuleResult(
    zModuleResult.parse(scenarios.getModuleResult.bibcheck.body),
  );

  it("the findings in the body are the numbers the poll declared", () => {
    const declared = countIssues(issuesOf(result));
    expect(
      verifyCounts({ state: "ok", attempt: 1, score: 64, counts: declared }, result),
    ).toBe(true);
  });

  it("a disagreement is reported rather than quietly recounted", () => {
    // Recounting on the client would make the screen add up while hiding that
    // the two sides disagree about the same job.
    expect(
      verifyCounts(
        {
          state: "ok",
          attempt: 1,
          score: 64,
          counts: { critical: 99, warning: 0, info: 0 },
        },
        result,
      ),
    ).toBe(false);
  });
});
