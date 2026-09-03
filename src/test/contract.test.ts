import { describe, expect, it } from "vitest";

import { eventKinds } from "@/lib/telemetry";
import {
  zAnchorRange,
  zApiError,
  zClientEvent,
  zEntitlements,
  zJobStatus,
  zModuleResult,
  zScoutResponse,
  zSessionResponse,
  zSubmitJobResponse,
} from "@/lib/api/wire/zod.gen";

import { scenarios } from "./msw/handlers.gen";

/**
 * The contract test. It checks not the server but our own chain: the examples
 * from the contract are parsed by the schemas generated from that same
 * contract. For now that is a tautology - and that is exactly what makes it
 * valuable: the day somebody edits a schema by hand or a mock drifts away from
 * the contract, the tautology stops adding up.
 *
 * The ugly cases are checked on equal terms with the happy path: a partial
 * module failure, a failed job, a 429, a 422 on a reused key and a refusal
 * without a token are precisely the responses screens usually break on.
 */
describe("the contract examples parse against the schemas", () => {
  it("creating a job returns a jobId and a jobToken", () => {
    const parsed = zSubmitJobResponse.parse(scenarios.submitJob.accepted.body);
    expect(parsed.jobId).not.toBe("");
    expect(parsed.jobToken).not.toBe("");
  });

  it("a response without a jobToken does not pass the schema", () => {
    // A non-negotiable point: without a token the job identifier is guessable,
    // and anyone can read the analysis of someone else's unpublished manuscript.
    expect(() =>
      zSubmitJobResponse.parse({
        jobId: "6d0b8b41-2f7a-4c1e-b3d9-0a5c7e2f9481",
        createdAt: "2026-08-24T09:41:07Z",
        entitlements: scenarios.getEntitlements.paid.body,
      }),
    ).toThrow();
  });

  it("the same key with the same body replays the job that key already names", () => {
    const first = zSubmitJobResponse.parse(scenarios.submitJob.accepted.body);
    const replay = zSubmitJobResponse.parse(scenarios.submitJob.idempotentReplay.body);
    expect(replay.jobId).toBe(first.jobId);
    expect(replay.jobToken).toBe(first.jobToken);
  });

  it.each([
    ["finished", scenarios.getJob.finished.body],
    ["running", scenarios.getJob.running.body],
    ["partial failure", scenarios.getJob.partial.body],
    ["failed", scenarios.getJob.failed.body],
    ["cancelled", scenarios.cancelJob.cancelled.body],
    ["retrying", scenarios.retryModule.retrying.body],
  ])('job state "%s" passes the schema', (_name, body) => {
    expect(() => zJobStatus.parse(body)).not.toThrow();
  });

  it.each([
    ["the key reused with a different body", scenarios.submitJob.keyReuse.body],
    ["a paid module with access closed", scenarios.submitJob.accessClosed.body],
    ["a paid module while signed out", scenarios.submitJob.authRequired.body],
    ["an intake limit exceeded", scenarios.submitJob.docTooLarge.body],
    ["a read without a token", scenarios.getJob.jobNotFound.body],
    ["a poll refused for volume", scenarios.getJob.rateLimited.body],
    ["a status we were not built to expect", scenarios.getJob.unexpected.body],
  ])('refusal "%s" passes the error schema', (_name, body) => {
    expect(() => zApiError.parse(body)).not.toThrow();
  });

  it("a refusal names the request it refused", () => {
    // Without the request id a report from a user cannot be matched to a log
    // line, and the whole error envelope stops being worth having.
    const refused = zApiError.parse(scenarios.getJob.rateLimited.body);
    expect(refused.error.requestId).not.toBe("");
    expect(refused.error.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("the job state a screen is built from", () => {
  const partial = zJobStatus.parse(scenarios.getJob.partial.body);

  it("a partial job carries a failed module and a skipped one side by side", () => {
    // `partial` is a normal state rather than a degraded one: the skipped card
    // is a verdict the person paid for and stays on screen next to the card
    // offering a retry.
    const modules = partial.documents[0]?.modules;
    expect(partial.state).toBe("partial");
    expect(modules?.cite?.state).toBe("error");
    expect(modules?.glossary?.state).toBe("skipped");
  });

  it("a failed module says why in a code and a skipped one in a dictionary key", () => {
    const modules = partial.documents[0]?.modules;
    expect(modules?.cite?.errorCode).toBe("LLM_UNAVAILABLE");
    expect(modules?.glossary?.skippedReasonKey).toBe("glossary.skipped.no_acronyms");
    // A skipped module is not a failure, so it carries no error code.
    expect(modules?.glossary?.errorCode).toBeUndefined();
  });

  it("a terminal module names where its result body is fetched from", () => {
    // The poll returns state; a dissertation's results are fetched once each
    // from resultRef while the poll ticks.
    const finished = zJobStatus.parse(scenarios.getJob.finished.body);
    const bibcheck = finished.documents[0]?.modules?.bibcheck;
    expect(bibcheck?.state).toBe("ok");
    expect(bibcheck?.resultRef).toMatch(/^\/jobs\/[^/]+\/documents\/[^/]+\/modules\//);
  });

  it("a stage keeps its id, so the progress list is not rebuilt on every tick", () => {
    const running = zJobStatus.parse(scenarios.getJob.running.body);
    const ids = running.stages.map((stage) => stage.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("entitlements", () => {
  it.each([
    ["signed out", scenarios.getEntitlements.anonymous.body],
    ["a trial still unspent", scenarios.getEntitlements.trial.body],
    ["paid access open", scenarios.getEntitlements.paid.body],
    ["the period elapsed", scenarios.getEntitlements.periodEnded.body],
  ])('entitlements "%s" pass the schema', (_name, body) => {
    expect(() => zEntitlements.parse(body)).not.toThrow();
  });

  it("whether a module is allowed is not derived from whether access is open", () => {
    // The ordinary case, not the exotic one: a registered account with the
    // trial run of Cite unspent carries allowed: true with access: false. A
    // client that computed one from the other would be wrong for most accounts
    // that have ever pressed the button.
    const trial = zEntitlements.parse(scenarios.getEntitlements.trial.body);
    expect(trial.access).toBe(false);
    expect(trial.modules.cite.allowed).toBe(true);
  });

  it("the free modules stay open in every state, including signed out", () => {
    for (const body of [
      scenarios.getEntitlements.anonymous.body,
      scenarios.getEntitlements.periodEnded.body,
    ]) {
      const entitlements = zEntitlements.parse(body);
      expect(entitlements.modules.bibcheck.allowed).toBe(true);
      expect(entitlements.modules.glossary.allowed).toBe(true);
    }
  });

  it("a locked module says which sentence the user reads", () => {
    const anonymous = zEntitlements.parse(scenarios.getEntitlements.anonymous.body);
    expect(anonymous.modules.cite.lockReason).toBe("requires-account");

    const ended = zEntitlements.parse(scenarios.getEntitlements.periodEnded.body);
    expect(ended.modules.cite.lockReason).toBe("period-ended");
  });

  it("no balance and no run counter reach the client", () => {
    // Quota is measured in days of access and the server does the spending, so
    // there is nothing here to count down on screen.
    const paid = zEntitlements.parse(scenarios.getEntitlements.paid.body);
    expect(Object.keys(paid)).toEqual(["role", "access", "periodEndsAt", "modules"]);
  });
});

describe("a module result body", () => {
  const bibcheck = zModuleResult.parse(scenarios.getModuleResult.bibcheck.body);

  it("every body states the unit its offsets are measured in", () => {
    // One unit is defined and no other is accepted, so a body that is silent
    // about it is as unusable as one that names a different one: the client
    // reads the field before it treats a single coordinate as its own.
    for (const [name, example] of Object.entries(scenarios.getModuleResult)) {
      if (example.status !== 200) continue;
      const body = zModuleResult.parse(example.body);
      expect([name, body.offsetUnit]).toEqual([name, "codepoints"]);
    }
  });

  it("a finding carries a wording key rather than a ready-made phrase", () => {
    const issue = bibcheck.issues[0];
    expect(issue?.titleKey).toBe("bibcheck.retracted_entry");
    expect(issue?.severity).toBe("critical");
  });

  it("every document an anchor points into is declared in texts[]", () => {
    // Without this the client cannot check that the coordinates belong to the
    // text it holds, and a jump lands in the wrong place.
    const declared = new Set(bibcheck.texts.map((text) => text.docId));
    const pointedAt = bibcheck.issues
      .flatMap((issue) => issue.anchors)
      .flatMap((anchor) => ("docId" in anchor && anchor.docId ? [anchor.docId] : []));

    expect(pointedAt.length).toBeGreaterThan(0);
    expect(pointedAt.filter((docId) => !declared.has(docId))).toEqual([]);
  });

  it("every range anchor of every body carries a quote as long as its offsets", () => {
    /*
     * The quote is the safety net under the coordinates, and it is only a net
     * if it is the whole of what the range covers. Checked over every example
     * rather than over one, because this is the invariant the stand is held to:
     * a body that breaks it has either truncated the quote or counted in
     * another unit, and both are found here or not at all.
     *
     * Parsed against the branch rather than narrowed by `kind`: the open branch
     * of the union accepts any kind at all, so a check on the tag alone tells
     * TypeScript nothing.
     */
    let checked = 0;
    for (const example of Object.values(scenarios.getModuleResult)) {
      if (example.status !== 200) continue;
      const body = zModuleResult.parse(example.body);
      for (const anchor of body.issues.flatMap((issue) => issue.anchors)) {
        if (anchor.kind !== "range") continue;
        const range = zAnchorRange.parse(anchor);
        expect([...range.quote].length).toBe(range.to - range.from);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("an artifact arrives as text rather than as a link", () => {
    // The file is assembled in the browser, so the body carries the content
    // itself and nothing has to be fetched to download it.
    expect(bibcheck.artifacts?.[0]?.content).toContain("@article");
  });

  it("Cite groups its candidates by what the card shows", () => {
    const cite = zModuleResult.parse(scenarios.getModuleResult.cite.body);
    const candidates = cite.issues[0]?.cite?.candidates ?? [];

    expect(candidates.some((candidate) => candidate.alreadyCited)).toBe(true);
    expect(candidates.some((candidate) => candidate.lowRelevance)).toBe(true);
    expect(candidates.some((candidate) => !candidate.lowRelevance)).toBe(true);
  });
});

describe("kinds this version of the schema does not define", () => {
  /**
   * A body whose anchor, fact and action are of kinds we have never heard of.
   * The finding has to survive - the card shows it without a jump target -
   * rather than the whole response being rejected over one unfamiliar branch.
   */
  const result = zModuleResult.parse(scenarios.getModuleResult.unknownKinds.body);
  const issue = result.issues[0];

  it("an anchor of an unfamiliar kind does not cost the response", () => {
    expect(issue?.anchors.map((anchor) => anchor.kind)).toEqual(["sidenote", "range"]);
  });

  it("the familiar anchor alongside it is still readable", () => {
    const range = issue?.anchors.find((anchor) => anchor.kind === "range");
    expect(range).toBeDefined();
  });

  it("a fact and an action of unfamiliar kinds survive too", () => {
    expect(issue?.evidence?.map((fact) => fact.kind)).toEqual(["confidence", "text"]);
    expect(issue?.actions?.map((action) => action.kind)).toEqual(["explain", "copy"]);
  });
});

describe("what the product says about itself", () => {
  /**
   * The one seam here that is not generated. Everything else in this file is our
   * own chain checked against itself; the kinds of event are written out in
   * `lib/telemetry` because the type is what keeps a manuscript out of a
   * context, and a kind the two sides disagree about is a batch refused whole.
   */
  it("the kinds the code can produce are the kinds the receiver accepts", () => {
    const declared = zClientEvent.shape.kind.options;
    expect([...eventKinds].sort()).toEqual([...declared].sort());
  });

  it("a context holds a number, a flag or an enumeration and nothing else", () => {
    const event = {
      id: "ev_1",
      ts: "2026-08-24T09:41:07Z",
      kind: "extract_failed",
      code: "PARSE_FAILED:NO_TEXT_LAYER",
      fingerprint: "extract_failed|PARSE_FAILED:NO_TEXT_LAYER|/|dev",
      count: 1,
      release: "dev",
      route: "/",
      locale: "en",
      theme: "light",
      viewport: { w: 1280, h: 800 },
      context: { pages: 340, printableRatio: 0.02 },
      breadcrumbs: [
        { action: "add-document", outcome: "failed", ts: "2026-08-24T09:41:00Z" },
      ],
    };
    expect(zClientEvent.parse(event).context.pages).toBe(340);

    // The contract is deliberately looser here than the client, which refuses
    // every string; what neither accepts is a shape that is none of the three.
    expect(() => zClientEvent.parse({ ...event, context: { pages: [1, 2] } })).toThrow();
  });
});

describe("the rest of the surface the screens read", () => {
  it("a partial Scout answer says which databases failed", () => {
    const scout = zScoutResponse.parse(scenarios.scoutSearch.results.body);
    expect(scout.searchedSources.length).toBeGreaterThan(0);
    expect(scout.degraded).toEqual(["openalex"]);
  });

  it("an anonymous principal is a normal session answer, and carries a CSRF token", () => {
    const session = zSessionResponse.parse(scenarios.getSession.anonymous.body);
    expect(session.user).toBeNull();
    expect(session.csrfToken).not.toBe("");
  });
});
