import { snapshotOf } from "@/lib/docs";
import { type ModuleId, type ModuleResult } from "@/lib/domain";
import { track } from "@/lib/telemetry";

/**
 * Whether the places in a body may be used at all.
 *
 * A module answers with offsets, and an offset is a number about a particular
 * string. The body says which text it counted over: for every document whose
 * coordinates appear in it, the hash and the length the server recomputed from
 * what it received. Comparing those with what we sent is the whole proof - and
 * when it fails, not one place of that body is used.
 *
 * The alternative is worse than showing nothing. A highlight standing on
 * coordinates from another version of the text looks exactly like a correct
 * one, so a finding about page 4 is quietly put on page 5 and read as our work
 * rather than as a defect. A list without places stays a useful result: the
 * finding still says what is wrong, and the person can find it themselves.
 */

/** The one unit the contract defines, and the only one whose numbers we use. */
const OFFSET_UNIT = "codepoints";

export type Anchoring = {
  readonly anchored: boolean;
  /** Which of the two failed, for the sentence the card shows. */
  readonly reason?: "offsetUnit" | "text";
};

export function anchoringOf(result: ModuleResult): Anchoring {
  if (result.offsetUnit !== OFFSET_UNIT) return { anchored: false, reason: "offsetUnit" };

  for (const text of result.texts) {
    const sent = snapshotOf(text.docId);
    // A document we have no snapshot of is one this tab did not send: the body
    // is about somebody's else run, or about a document that has been cleared.
    if (sent === undefined) return { anchored: false, reason: "text" };
    if (sent.textSha256 !== text.textSha256 || sent.cpLength !== text.cpLength) {
      return { anchored: false, reason: "text" };
    }
  }

  return { anchored: true };
}

/**
 * The same verdict, reported. It is separate from the verdict itself because
 * the verdict is asked for while the screen is being drawn - once per render,
 * and twice over under StrictMode - and an event raised there would turn one
 * disagreement into a stream of identical events.
 */
export function reportAnchoring(result: ModuleResult): Anchoring {
  const verdict = anchoringOf(result);
  if (verdict.reason === "offsetUnit") {
    track("schema_error", { code: `OFFSET_UNIT_UNSUPPORTED:${result.module}` });
  } else if (verdict.reason === "text") {
    track("schema_error", { code: `TEXT_MISMATCH:${result.module}` });
  }
  return verdict;
}

/**
 * One code of a module, one dictionary key. The module chooses both - the code
 * decides how a finding is drawn and grouped, the key decides how it reads in
 * the person's language - and they are meant to move together. When they do
 * not, the client draws what it was sent and says so from here: the same code
 * under two keys, or one key under two codes, is invisible on the screen and
 * shows up months later as two wordings for one problem.
 */
const wordings = new Map<string, string>();
const keys = new Map<string, string>();

export function verifyWording(module: ModuleId, result: ModuleResult): void {
  for (const issue of result.issues) {
    const code = `${module}.${issue.code}`;
    const known = wordings.get(code);
    if (known === undefined) wordings.set(code, issue.titleKey);
    else if (known !== issue.titleKey) {
      track("schema_error", { code: `TITLE_KEY_DRIFT:${code}` });
    }

    const owner = keys.get(issue.titleKey);
    if (owner === undefined) keys.set(issue.titleKey, code);
    else if (owner !== code) {
      track("schema_error", { code: `TITLE_KEY_DRIFT:${issue.titleKey}` });
    }
  }
}

/** For the tests: the pairs are remembered for the life of the tab. */
export function forgetWording(): void {
  wordings.clear();
  keys.clear();
}
