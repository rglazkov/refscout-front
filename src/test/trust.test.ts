import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toModuleResult } from "@/lib/api/mappers";
import { zModuleResult } from "@/lib/api/schemas";
import { clearSnapshots, placesOf, recordSnapshot } from "@/lib/docs";
import { docRegistry } from "@/lib/docs";
import { asDocOffset, type ModuleResult, type Place } from "@/lib/domain";
import {
  anchoringOf,
  forgetWording,
  reportAnchoring,
  verifyWording,
} from "@/lib/normalize";
import { drainEvents } from "@/lib/telemetry";

import { scenarios } from "./msw/handlers.gen";

/**
 * Whether a body's places may be used at all, and what happens to the findings
 * when they may not.
 *
 * This is the check that keeps the product from committing its worst mistake:
 * a highlight standing on coordinates counted over another version of the text
 * looks exactly like a correct one, so a finding about page 4 quietly appears
 * on page 5 and is read as our work rather than as a defect. The rule is that
 * the finding is always kept and the place is what is given up.
 */
const body = scenarios.getModuleResult.bibcheck.body;
const OWN = body.texts[0] ?? { docId: "", textSha256: "", cpLength: 0 };
const OTHER = body.texts[1] ?? OWN;

function parsed(patch: Record<string, unknown> = {}): ModuleResult {
  return toModuleResult(zModuleResult.parse({ ...body, ...patch }), "req_test");
}

/** The two documents this body's coordinates are counted over, as we sent them. */
function sendBoth(): void {
  recordSnapshot(OWN.docId, {
    textSha256: OWN.textSha256,
    cpLength: OWN.cpLength,
    astral: null,
  });
  recordSnapshot(OTHER.docId, {
    textSha256: OTHER.textSha256,
    cpLength: OTHER.cpLength,
    astral: null,
  });
}

beforeEach(() => {
  clearSnapshots();
  docRegistry.clear();
  forgetWording();
  drainEvents();
});

afterEach(() => {
  clearSnapshots();
  docRegistry.clear();
});

describe("a body is trusted only when it was counted over the text we sent", () => {
  it("the hashes and the lengths of every document in it have to match", () => {
    sendBoth();
    expect(anchoringOf(parsed()).anchored).toBe(true);
  });

  it("a hash the server recomputed differently takes the places away", () => {
    sendBoth();
    recordSnapshot(OWN.docId, {
      textSha256: "0".repeat(64),
      cpLength: OWN.cpLength,
      astral: null,
    });
    expect(anchoringOf(parsed())).toEqual({ anchored: false, reason: "text" });
  });

  it("a length that disagrees is enough on its own", () => {
    sendBoth();
    recordSnapshot(OWN.docId, {
      textSha256: OWN.textSha256,
      cpLength: OWN.cpLength + 1,
      astral: null,
    });
    expect(anchoringOf(parsed())).toEqual({ anchored: false, reason: "text" });
  });

  it("a document this tab never sent is not a document we can place anything in", () => {
    expect(anchoringOf(parsed()).anchored).toBe(false);
  });

  it("an offset unit the contract does not define is refused before the hashes", () => {
    sendBoth();
    const verdict = anchoringOf(parsed({ offsetUnit: "utf16" }));
    expect(verdict).toEqual({ anchored: false, reason: "offsetUnit" });
  });

  it("a body in another unit still arrives with all of its findings", () => {
    // The unit is about where a finding is, not about whether it exists. A
    // response dropped over it would throw away a check the person paid for.
    const result = parsed({ offsetUnit: "utf16" });
    expect(result.issues).toHaveLength(body.issues.length);
  });

  it("each refusal is reported once it is seen, with the module in the code", () => {
    reportAnchoring(parsed({ offsetUnit: "utf16" }));
    expect(drainEvents().map((event) => event.code)).toEqual([
      "OFFSET_UNIT_UNSUPPORTED:bibcheck",
    ]);

    sendBoth();
    recordSnapshot(OWN.docId, {
      textSha256: "0".repeat(64),
      cpLength: OWN.cpLength,
      astral: null,
    });
    reportAnchoring(parsed());
    expect(drainEvents().map((event) => event.code)).toEqual(["TEXT_MISMATCH:bibcheck"]);
  });

  it("the identifier of the request that brought the body travels with it", () => {
    // It is what a person quotes to support: the one line in our logs that
    // describes what they actually received.
    expect(parsed().requestId).toBe("req_test");
  });
});

describe("a place is said in words, and the words are ours", () => {
  const docId = OWN.docId;

  beforeEach(() => {
    sendBoth();
    docRegistry.put(docId, {
      text: "x",
      originalSha256: "",
      pages: [
        { page: 4, from: asDocOffset(12_000), to: asDocOffset(13_000) },
        { page: 9, from: asDocOffset(38_000), to: asDocOffset(39_000) },
      ],
      hadBom: false,
      eol: "\n",
    });
  });

  /** One resolved place, as the resolver would have handed it back. */
  function at(offset: number, quote?: string): Place {
    return {
      status: "exact",
      docId,
      anchor: asDocOffset(offset),
      range: { from: asDocOffset(offset), to: asDocOffset(offset + 17) },
      ...(quote === undefined ? {} : { quote }),
    };
  }

  it("a finding cited twice names both pages and counts its places", () => {
    const places = placesOf([
      { status: "derived", docId, bibkey: "smith2019attention" },
      at(12_045, "Smith et al. [22]"),
      at(38_110, "Smith et al. [22]"),
    ]);
    expect(places.pages).toEqual([4, 9]);
    expect(places.count).toBe(3);
    expect(places.resolved).toBe(3);
    expect(places.bibkeys).toEqual(["smith2019attention"]);
    expect(places.quote).toBe("Smith et al. [22]");
  });

  it("a place that would not resolve keeps its key and its quote and loses its page", () => {
    // The finding stays in the list either way. What it loses is the number
    // beside it, because a page worked out from an address that did not resolve
    // is a confident answer to the wrong question.
    const places = placesOf([
      { status: "lost", docId, failure: "NOT_FOUND", bibkey: "smith2019attention" },
      { status: "lost", docId, failure: "NOT_FOUND", quote: "Smith et al. [22]" },
    ]);
    expect(places.pages).toEqual([]);
    expect(places.resolved).toBe(0);
    expect(places.lost).toBe(2);
    expect(places.bibkeys).toEqual(["smith2019attention"]);
    expect(places.quote).toBe("Smith et al. [22]");
  });

  it("a fragment the person has edited keeps its jump and loses its highlight", () => {
    const places = placesOf([
      { ...at(12_045, "Smith et al. [22]"), range: undefined, edited: true },
    ]);
    expect(places.edited).toBe(true);
    expect(places.pages).toEqual([4]);
  });

  it("a range whose quote is not its length is marked where the answer arrives", () => {
    // Truncated, or measured in another unit; either way the offsets beside it
    // describe a different text, so the resolver is told not to search on it.
    const result = parsed({
      issues: [
        {
          ...body.issues[0],
          anchors: [{ kind: "range", from: 12_045, to: 12_062, quote: "Smith" }],
        },
      ],
    });
    const anchor = result.issues[0]?.anchors[0];
    expect(anchor?.kind === "range" && anchor.quoteMismatch).toBe(true);
    expect(drainEvents().map((event) => event.code)).toContain(
      "QUOTE_LENGTH_MISMATCH:anchor.quote",
    );
  });
});

describe("two findings under one identifier stay two findings", () => {
  it("the second is given a suffix rather than folded into the first", () => {
    const result = parsed({
      issues: [body.issues[0], { ...body.issues[0], severity: "warning" }],
    });
    expect(result.issues.map((issue) => issue.issueId)).toEqual(["iss_1", "iss_1#1"]);
    // Both remember what the module called them, so a fix on the server can be
    // matched to what we drew.
    expect(result.issues.every((issue) => issue.serverId === "iss_1")).toBe(true);
    expect(drainEvents().map((event) => event.code)).toContain(
      "DUPLICATE_ISSUE_ID:bibcheck",
    );
  });
});

describe("one code of a module, one wording", () => {
  it("the same code under a second key is reported, and both are still drawn", () => {
    const first = parsed();
    verifyWording("bibcheck", first);
    expect(drainEvents()).toEqual([]);

    const drifted = parsed({
      issues: [{ ...body.issues[0], titleKey: "bibcheck.retracted_entry_v2" }],
    });
    verifyWording("bibcheck", drifted);
    expect(drainEvents().map((event) => event.code)).toContain(
      "TITLE_KEY_DRIFT:bibcheck.RETRACTED_ENTRY",
    );
    expect(drifted.issues[0]?.titleKey).toBe("bibcheck.retracted_entry_v2");
  });

  it("one key answering for a second code is the same drift seen from the other side", () => {
    verifyWording("bibcheck", parsed());
    const drifted = parsed({
      issues: [{ ...body.issues[0], code: "RETRACTED_WORK" }],
    });
    verifyWording("bibcheck", drifted);
    expect(drainEvents().map((event) => event.code)).toContain(
      "TITLE_KEY_DRIFT:bibcheck.retracted_entry",
    );
  });
});
