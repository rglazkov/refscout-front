import { describe, expect, it } from "vitest";

import {
  toEntitlements,
  toJobStatus,
  toModuleResult,
  toSubmitJobResult,
} from "@/lib/api/mappers";
import { fromSubmitJobRequest } from "@/lib/api/mappers/submit";
import {
  zEntitlements,
  zJobStatus,
  zModuleResult,
  zSubmitJobResponse,
} from "@/lib/api/wire/zod.gen";
import { type SubmitJobRequest, defaultOptions } from "@/lib/domain";

import { scenarios } from "./msw/handlers.gen";

/**
 * The seam. The mappers are fed the contract's own examples, parsed by the
 * schemas generated from that same contract, and what comes out is checked
 * against what the screens need. When the server's shape moves, this is where
 * it stops compiling - one directory, rather than a `undefined` inside JSX.
 */
describe("a module result becomes findings the cards can draw", () => {
  const result = toModuleResult(
    zModuleResult.parse(scenarios.getModuleResult.bibcheck.body),
  );

  it("carries a wording key rather than a ready-made phrase", () => {
    expect(result.issues[0]?.titleKey).toBe("bibcheck.retracted_entry");
    expect(result.issues[0]?.severity).toBe("critical");
  });

  it("the optional collections arrive as empty arrays rather than as undefined", () => {
    // A card that has to branch on undefined before it can map over a list is a
    // card that will forget to, once.
    expect(Array.isArray(result.issues[1]?.evidence)).toBe(true);
    expect(Array.isArray(result.issues[1]?.actions)).toBe(true);
  });

  it("an artifact arrives as text, so the file is assembled here", () => {
    expect(result.artifacts[0]?.content).toContain("@article");
  });
});

describe("a kind this version does not define survives", () => {
  const result = toModuleResult(
    zModuleResult.parse(scenarios.getModuleResult.unknownKinds.body),
  );
  const issue = result.issues[0];

  it("an unfamiliar anchor costs the finding its jump target, not the response", () => {
    expect(issue?.anchors.map((anchor) => anchor.kind)).toEqual(["unknown", "range"]);
    const unfamiliar = issue?.anchors[0];
    expect(unfamiliar?.kind === "unknown" ? unfamiliar.rawKind : "").toBe("sidenote");
  });

  it("the familiar anchor beside it keeps its coordinates", () => {
    const range = issue?.anchors.find((anchor) => anchor.kind === "range");
    expect(range?.kind === "range" ? range.to > range.from : false).toBe(true);
  });

  it("an unfamiliar fact and an unfamiliar action survive too", () => {
    expect(issue?.evidence.map((fact) => fact.kind)).toEqual(["unknown", "text"]);
    expect(issue?.actions.map((action) => action.kind)).toEqual(["unknown", "copy"]);
  });
});

describe("job state becomes what the results screen reads", () => {
  it("a partial job keeps a failed module and a skipped one apart", () => {
    const status = toJobStatus(zJobStatus.parse(scenarios.getJob.partial.body));
    const modules = status.documents[0]?.modules;
    expect(modules?.cite?.state).toBe("error");
    expect(modules?.cite?.errorCode).toBe("LLM_UNAVAILABLE");
    expect(modules?.glossary?.state).toBe("skipped");
    expect(modules?.glossary?.skippedReasonKey).toBe("glossary.skipped.no_acronyms");
  });

  it("a module without a score keeps null rather than becoming zero", () => {
    // "Checked, and it is bad" and "not checked" are different sentences on the
    // card and different actions for the reader.
    const status = toJobStatus(zJobStatus.parse(scenarios.getJob.finished.body));
    expect(status.documents[0]?.modules.cite?.score).toBeNull();
    expect(status.documents[0]?.modules.bibcheck?.score).toBe(64);
  });

  it("whether a module is allowed is not derived from whether access is open", () => {
    const trial = toEntitlements(
      zEntitlements.parse(scenarios.getEntitlements.trial.body),
    );
    expect(trial.access).toBe(false);
    expect(trial.modules.cite.allowed).toBe(true);
  });

  it("a created job carries the token every read of it needs", () => {
    const created = toSubmitJobResult(
      zSubmitJobResponse.parse(scenarios.submitJob.accepted.body),
    );
    expect(created.jobToken).not.toBe("");
  });
});

describe("what goes out", () => {
  const request: SubmitJobRequest = {
    documents: [
      {
        docId: "0f2c1d64-9b3a-4a7e-8f11-2d9c5b0a7e31",
        // The raw name travels, not the displayed one: sanitisation is a rule
        // about showing a name.
        name: "../paper v7.tex",
        role: "manuscript",
        format: "tex",
        checks: ["presubmit", "cite"],
        text: "\\documentclass{article}",
        textSha256: "a".repeat(64),
        cpLength: 23,
        options: defaultOptions,
        venue: {
          kind: "file",
          source: "neurips-2026.txt",
          docId: "5b1f7a02-3c4e-4d19-9a76-8e2b0c4d5f63",
          state: "ready",
        },
      },
    ],
    locale: "en",
  };

  const wire = fromSubmitJobRequest(request);

  it("the raw file name is what is sent", () => {
    expect(wire.documents[0]?.name).toBe("../paper v7.tex");
  });

  it("the venue names the document carrying the requirements, and no state of ours goes with it", () => {
    // The requirements themselves travel as a document of the job like every
    // other text; the fetch state describes a request the browser made and says
    // nothing about the check.
    expect(wire.documents[0]?.venue).toEqual({
      kind: "file",
      source: "neurips-2026.txt",
      docId: "5b1f7a02-3c4e-4d19-9a76-8e2b0c4d5f63",
    });
  });

  it("the settings of all four modules go with the document, in full", () => {
    // They belong to the document rather than to the job: two manuscripts in
    // one buffer are two manuscripts with two subject areas.
    expect(Object.keys(wire.documents[0]?.options ?? {}).sort()).toEqual([
      "bibcheck",
      "cite",
      "glossary",
      "presubmit",
    ]);
  });

  it("the idempotency key is not a field of the body", () => {
    // It is about delivery rather than about the content of the job, and it
    // travels as a header.
    expect(JSON.stringify(wire)).not.toContain("Idempotency");
    expect(Object.keys(wire).sort()).toEqual(["documents", "locale"]);
  });
});
