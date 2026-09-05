import {
  type BibSpan,
  type DocOffset,
  type Place,
  type PlaceFailure,
  asDocOffset,
} from "@/lib/domain";

import { foldedForm, nfcForm, type Rewritten } from "./forms";
import { buildIndex, MIN_KEY_LENGTH, occurrences, type TextIndex } from "./text-index";

/**
 * Turning the places a module sent into places on the text in front of the
 * person, and saying honestly when it cannot.
 *
 * Two texts can disagree. The one the module read is the one that was sent; the
 * one on screen may have been corrected since, and a module may work on its own
 * reading of a document rather than on ours. So a coordinate is checked before
 * it is used: the text at it must be the text the module quoted. When it is,
 * that is the whole story and the ordinary path. When it is not, the fragment
 * is searched for by its own text and by the neighbours that came with it, and
 * what comes back is either one place - which says it was found rather than
 * given - or nothing at all.
 *
 * Nothing here guesses. Two candidates that both fit are a refusal, not a coin
 * toss: a highlight in the wrong paragraph is indistinguishable from a correct
 * one, so one of them costs the reader their trust in all the rest, and they
 * have no way of auditing what was drawn.
 */

/**
 * A place with its numbers already in the coordinates of the live text. The
 * conversion out of code points and the catching up over edits made since the
 * text was sent both happen before this, so that each of them exists in one
 * place rather than in every branch below.
 */
export type ProjectedAnchor =
  | {
      readonly kind: "range";
      readonly docId: string;
      readonly from: DocOffset;
      readonly to: DocOffset;
      readonly quote: string;
      readonly prefix?: string;
      readonly suffix?: string;
      /** Set when the numbers were already refused; nothing is searched for. */
      readonly failure?: PlaceFailure;
    }
  | {
      readonly kind: "quote";
      readonly docId: string;
      readonly quote: string;
      readonly prefix?: string;
      readonly suffix?: string;
      readonly near?: DocOffset;
    }
  | {
      readonly kind: "point";
      readonly docId: string;
      readonly at: DocOffset;
      readonly prefix?: string;
      readonly suffix?: string;
      readonly failure?: PlaceFailure;
    }
  | { readonly kind: "bibkey"; readonly docId: string; readonly bibkey: string }
  /** A whole document, and the kinds this version has never heard of. */
  | { readonly kind: "none"; readonly docId: string };

export type ResolveIssue = {
  readonly issueId: string;
  readonly anchors: readonly ProjectedAnchor[];
};

export type ResolveRequest = {
  /** Every document any of these places names, by id. */
  readonly texts: Readonly<Record<string, string>>;
  /** Where the entries of each bibliography sit, as this browser reads them. */
  readonly bibEntries: Readonly<Record<string, readonly BibSpan[]>>;
  readonly issues: readonly ResolveIssue[];
  /**
   * How long the whole pass may take. It is insurance against a tab that has
   * stopped answering rather than a working mode: two seconds is orders of
   * magnitude more than the largest document needs, so reaching it means a
   * defect of ours or an answer no threshold caught.
   */
  readonly budgetMs?: number;
};

export type ResolveCounts = {
  readonly exact: number;
  readonly relocated: number;
  readonly derived: number;
  readonly none: number;
  readonly lost: number;
  /** Places that needed the most forgiving comparison: a module's own reading. */
  readonly folded: number;
  /** Places the budget ran out before: zero on any healthy pass. */
  readonly overBudget: number;
};

export type ResolveResult = {
  readonly places: Readonly<Record<string, readonly Place[]>>;
  readonly counts: ResolveCounts;
};

const DEFAULT_BUDGET_MS = 2_000;

/** How far from where a place was expected a single candidate is still it. */
const TRUST_WINDOW = 64;

/** A rewritten text with an index of its own, built when a pass needs one. */
type Form = {
  readonly rewritten: Rewritten;
  /** Whether rewriting changed anything: if it did not, the pass is a repeat. */
  readonly same: boolean;
  index: TextIndex | null;
};

function formOf(rewritten: Rewritten, source: string): Form {
  return { rewritten, same: rewritten.text === source, index: null };
}

function indexOfForm(form: Form): TextIndex {
  form.index ??= buildIndex(form.rewritten.text);
  return form.index;
}

/**
 * One document, and the three ways of comparing against it. Each form and each
 * index is built when a pass first needs it and dropped with the pass: an index
 * describes one exact state of one text, and the first edit makes it wrong.
 */
class Document {
  private exact: TextIndex | null = null;
  private nfc: Form | null = null;
  private folded: Form | null = null;

  constructor(readonly text: string) {}

  exactIndex(): TextIndex {
    this.exact ??= buildIndex(this.text);
    return this.exact;
  }

  nfcForm(): Form {
    this.nfc ??= formOf(nfcForm(this.text), this.text);
    return this.nfc;
  }

  foldedForm(): Form {
    this.folded ??= formOf(foldedForm(this.text), this.text);
    return this.folded;
  }
}

/** Where in a rewritten text the character at a source offset ended up. */
function positionIn(form: Rewritten, source: number): number {
  let low = 0;
  let high = form.map.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((form.map[middle] ?? 0) < source) low = middle + 1;
    else high = middle;
  }
  return low;
}

type Found = { readonly from: number; readonly to: number };

/**
 * What one place is searched by: the neighbouring text on the left, the
 * fragment itself, and the neighbouring text on the right, rewritten together
 * so that a run of spaces spanning a boundary folds the way it does in the
 * document. The two numbers say where the fragment sits inside the key, so that
 * a match on the whole key gives back the fragment rather than its
 * surroundings.
 */
type Key = {
  readonly whole: string;
  readonly quoteFrom: number;
  readonly quoteTo: number;
};

function keyOf(
  prefix: string,
  quote: string,
  suffix: string,
  rewrite: (text: string) => string,
): Key {
  const head = rewrite(prefix);
  const headAndQuote = rewrite(prefix + quote);
  return {
    whole: rewrite(prefix + quote + suffix),
    quoteFrom: head.length,
    quoteTo: headAndQuote.length,
  };
}

const identity = (text: string): string => text;
const nfcOf = (text: string): string => nfcForm(text).text;
const foldOf = (text: string): string => foldedForm(text).text;

/**
 * A single occurrence of the key within reach of where the place was expected.
 *
 * The window is what makes coordinates worth having. A fragment like
 * "Smith et al." repeats through a thesis by nature, and a failed comparison
 * after a small edit means the place moved by a few characters rather than that
 * another occurrence was meant - so the one candidate near where it should be
 * is it, even where the same words appear ten times elsewhere. Two candidates
 * inside the window are still refused: a window narrows the search and does not
 * confer the right to choose.
 */
function withinWindow(text: string, key: Key, expected: number): Found | "many" | null {
  const from = Math.max(0, expected - TRUST_WINDOW - key.quoteFrom);
  const to = Math.min(text.length, expected + TRUST_WINDOW + key.whole.length);
  const window = text.slice(from, to);
  const first = window.indexOf(key.whole);
  if (first === -1) return null;
  if (window.indexOf(key.whole, first + 1) !== -1) return "many";
  return { from: from + first + key.quoteFrom, to: from + first + key.quoteTo };
}

/** The one occurrence of the key in the whole document, or why there is not one. */
function acrossDocument(index: TextIndex, key: Key): Found | "many" | null {
  if (key.whole.length < MIN_KEY_LENGTH) return null;
  const hits = occurrences(index, key.whole, 2);
  if (hits.length === 0) return null;
  if (hits.length > 1) return "many";
  const start = hits[0] ?? 0;
  return { from: start + key.quoteFrom, to: start + key.quoteTo };
}

type Pass = {
  readonly text: string;
  readonly key: Key;
  readonly index: () => TextIndex;
  readonly back: (offset: number) => number;
  readonly at: number | null;
  readonly folded: boolean;
};

type Outcome =
  | { readonly kind: "found"; readonly range: Found; readonly folded: boolean }
  | { readonly kind: "failed"; readonly failure: PlaceFailure };

/**
 * A pass over one of the rewritten forms, or no pass at all when rewriting
 * changed nothing: comparing against a copy of a text that has just been
 * compared is a second index and a second walk for an answer already given.
 */
function formPass(
  document: Document,
  form: Form,
  prefix: string,
  quote: string,
  suffix: string,
  expected: number | null,
  rewrite: (text: string) => string,
  folded: boolean,
): readonly Pass[] {
  if (form.same) return [];
  const { rewritten } = form;
  return [
    {
      text: rewritten.text,
      key: keyOf(prefix, quote, suffix, rewrite),
      index: () => indexOfForm(form),
      back: (offset) => rewritten.map[offset] ?? document.text.length,
      at: expected === null ? null : positionIn(rewritten, expected),
      folded,
    },
  ];
}

/**
 * The search, in three passes over increasingly forgiving comparisons: the
 * characters as they are, the characters composed, and the characters with
 * everything a text pipeline flattens flattened.
 *
 * A pass begins only where the one before it found nothing at all. An ambiguous
 * answer is final, because loosening the comparison after two candidates
 * already fit can only produce more of them.
 */
function search(
  document: Document,
  prefix: string,
  quote: string,
  suffix: string,
  expected: number | null,
): Outcome {
  const exactKey = keyOf(prefix, quote, suffix, identity);
  /*
   * Whether the fragment and its neighbours together are long enough to be
   * looked up at all. A shorter key cannot be indexed, so it cannot be checked
   * against the whole document - but it can still be compared directly against
   * the hundred and twenty-eight characters around where the place was expected,
   * and for a place that arrived with coordinates that is usually where it is.
   * So the length gates the global check and not the search, and only a place
   * that also has no window left to look in is refused for it.
   *
   * The refusal has a code of its own because it means a module sent a place
   * with neither length nor context, which the contract requires of every one:
   * an address for a letter to the backend rather than a defect here.
   */
  const indexable = exactKey.whole.length >= MIN_KEY_LENGTH;

  const passes: readonly Pass[] = [
    {
      text: document.text,
      key: exactKey,
      index: () => document.exactIndex(),
      back: (offset) => offset,
      at: expected,
      folded: false,
    },
    ...formPass(
      document,
      document.nfcForm(),
      prefix,
      quote,
      suffix,
      expected,
      nfcOf,
      false,
    ),
    ...formPass(
      document,
      document.foldedForm(),
      prefix,
      quote,
      suffix,
      expected,
      foldOf,
      true,
    ),
  ];

  for (const pass of passes) {
    const near = pass.at === null ? null : withinWindow(pass.text, pass.key, pass.at);
    if (near === "many") return { kind: "failed", failure: "AMBIGUOUS" };
    if (near !== null) {
      return {
        kind: "found",
        range: { from: pass.back(near.from), to: pass.back(near.to) },
        folded: pass.folded,
      };
    }

    if (!indexable) continue;
    const anywhere = acrossDocument(pass.index(), pass.key);
    if (anywhere === "many") return { kind: "failed", failure: "AMBIGUOUS" };
    if (anywhere !== null) {
      return {
        kind: "found",
        range: { from: pass.back(anywhere.from), to: pass.back(anywhere.to) },
        folded: pass.folded,
      };
    }
  }

  return { kind: "failed", failure: indexable ? "NOT_FOUND" : "ANCHOR_KEY_TOO_SHORT" };
}

/**
 * Where a key names an entry of a bibliography. The map built while the file
 * was read answers first; failing that, the key is accepted where it appears
 * literally in the position an entry key occupies, and only where it appears
 * there once. A reference list typed out by hand in Word has no keys at all,
 * and inventing a boundary for one would put the highlight on whatever sentence
 * happened to contain the word.
 */
function fromBibliography(
  document: Document,
  entries: readonly BibSpan[] | undefined,
  key: string,
): Found | null {
  const entry = entries?.find((candidate) => candidate.key === key);
  if (entry !== undefined) return { from: entry.from, to: entry.to };

  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const literal = new RegExp(
    "(?:@[ \\t]*[A-Za-z]+[ \\t\\r\\n]*\\{|\\\\bibitem\\{)" + escaped + "[,}\\s]",
    "g",
  );
  let only: Found | null = null;
  for (const match of document.text.matchAll(literal)) {
    if (only !== null) return null;
    only = { from: match.index, to: match.index + match[0].length };
  }
  return only;
}

function found(
  status: Place["status"],
  docId: string,
  range: Found,
  quote?: string,
): Place {
  return {
    status,
    docId,
    anchor: asDocOffset(range.from),
    range: { from: asDocOffset(range.from), to: asDocOffset(range.to) },
    ...(quote === undefined || quote === "" ? {} : { quote }),
  };
}

function lost(docId: string, failure: PlaceFailure, quote?: string): Place {
  return {
    status: "lost",
    docId,
    failure,
    ...(quote === undefined || quote === "" ? {} : { quote }),
  };
}

function quoteOf(anchor: ProjectedAnchor): string {
  return anchor.kind === "range" || anchor.kind === "quote" ? anchor.quote : "";
}

/**
 * Every place of every finding in one module's answer.
 *
 * The order of the work matters in one respect, and it is the empty range: a
 * range of zero length quotes nothing, so there is nothing to check it against
 * and nothing to search for, and the only evidence it has is that everything
 * else in its document lined up. So the ranges that can be verified are
 * resolved first and the empty ones read the verdict afterwards - which is also
 * why the order the findings arrive in decides nothing.
 */
export function resolveAnchors(request: ResolveRequest): ResolveResult {
  const documents = new Map<string, Document>();
  for (const [docId, text] of Object.entries(request.texts)) {
    documents.set(docId, new Document(text));
  }

  const budget = request.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();

  const counts = {
    exact: 0,
    relocated: 0,
    derived: 0,
    none: 0,
    lost: 0,
    folded: 0,
    overBudget: 0,
  };
  /** Documents where a range that could be checked did not check out. */
  const doubted = new Set<string>();
  const empties: {
    readonly issueId: string;
    readonly at: number;
    readonly docId: string;
    readonly offset: DocOffset;
  }[] = [];
  const places: Record<string, Place[]> = {};

  for (const issue of request.issues) {
    const resolved: Place[] = [];
    for (const anchor of issue.anchors) {
      const document = documents.get(anchor.docId);
      if (anchor.kind === "none" || document === undefined) {
        resolved.push({ status: "none", docId: anchor.docId });
        counts.none += 1;
        continue;
      }

      if (Date.now() - startedAt > budget) {
        resolved.push(lost(anchor.docId, "ANCHOR_BUDGET"));
        counts.lost += 1;
        counts.overBudget += 1;
        continue;
      }

      if (anchor.kind === "bibkey") {
        const entry = fromBibliography(
          document,
          request.bibEntries[anchor.docId],
          anchor.bibkey,
        );
        if (entry === null) {
          resolved.push({ ...lost(anchor.docId, "NOT_FOUND"), bibkey: anchor.bibkey });
          counts.lost += 1;
        } else {
          resolved.push({
            ...found("derived", anchor.docId, entry),
            bibkey: anchor.bibkey,
          });
          counts.derived += 1;
        }
        continue;
      }

      const refused = anchor.kind === "quote" ? undefined : anchor.failure;

      if (anchor.kind === "range" && refused === undefined && anchor.from === anchor.to) {
        // Held back until every range that can be checked has been.
        empties.push({
          issueId: issue.issueId,
          at: resolved.length,
          docId: anchor.docId,
          offset: anchor.from,
        });
        resolved.push(lost(anchor.docId, "NOT_FOUND"));
        continue;
      }

      if (refused !== undefined) {
        doubted.add(anchor.docId);
        resolved.push(lost(anchor.docId, refused, quoteOf(anchor)));
        counts.lost += 1;
        continue;
      }

      const prefix = anchor.prefix ?? "";
      const suffix = anchor.suffix ?? "";

      if (anchor.kind === "range") {
        const standing = document.text.slice(anchor.from, anchor.to);
        if (standing === anchor.quote || nfcOf(standing) === nfcOf(anchor.quote)) {
          resolved.push(
            found(
              "exact",
              anchor.docId,
              { from: anchor.from, to: anchor.to },
              anchor.quote,
            ),
          );
          counts.exact += 1;
          continue;
        }
        // One range of this document did not hold what it said it held, which
        // is what the empty ranges below are waiting to hear.
        doubted.add(anchor.docId);
      }

      /*
       * An insertion point has no text of its own, so what is checked is the
       * text meeting it on either side. Where that is what the module sent, the
       * position is the one it named and nothing needs finding - which is the
       * same verdict a range gets for the same reason, and it has to be reached
       * before the search or every point in a healthy answer would be reported
       * as having been searched for.
       */
      if (anchor.kind === "point") {
        const before = document.text.slice(anchor.at - prefix.length, anchor.at);
        const after = document.text.slice(anchor.at, anchor.at + suffix.length);
        if (before === prefix && after === suffix) {
          resolved.push(found("exact", anchor.docId, { from: anchor.at, to: anchor.at }));
          counts.exact += 1;
          continue;
        }
      }

      const expected =
        anchor.kind === "range"
          ? anchor.from
          : anchor.kind === "point"
            ? anchor.at
            : (anchor.near ?? null);
      const quote = anchor.kind === "point" ? "" : anchor.quote;
      const outcome = search(document, prefix, quote, suffix, expected);

      if (outcome.kind === "failed") {
        resolved.push(lost(anchor.docId, outcome.failure, quote));
        counts.lost += 1;
        continue;
      }
      resolved.push(found("relocated", anchor.docId, outcome.range, quote));
      counts.relocated += 1;
      if (outcome.folded) counts.folded += 1;
    }
    places[issue.issueId] = resolved;
  }

  /*
   * The empty ranges, now that the verdict of their document is known. Where
   * something in it did not line up they are refused: a highlight placed by
   * arithmetic that has already been shown wrong once in this document is a
   * guess wearing the appearance of a result. Where everything else checked
   * out, the offset is taken as given and the line it falls on is what is
   * marked.
   */
  for (const empty of empties) {
    const list = places[empty.issueId];
    if (list === undefined) continue;
    if (doubted.has(empty.docId)) {
      counts.lost += 1;
      continue;
    }
    list[empty.at] = {
      status: "exact",
      docId: empty.docId,
      anchor: empty.offset,
      range: { from: empty.offset, to: empty.offset },
    };
    counts.exact += 1;
  }

  return { places, counts };
}
