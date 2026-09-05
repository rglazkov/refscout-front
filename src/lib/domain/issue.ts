import { type ModuleId, type Severity } from "./ids";
import { type CpOffset } from "./offsets";

/**
 * One finding, in the shape the card that draws it needs. The domain is
 * designed from the screens, so what is here is what a card draws: a severity,
 * a phrase key with its substitutions, the places it points at, typed facts,
 * offered actions, and whether an edit has left it behind.
 */
export type Issue = {
  /**
   * The identifier everything else hangs on: the marks a person puts on a
   * finding, the open row on the screen, the line in the report. It is the
   * server's `issueId` unless that arrived twice inside one body, in which case
   * the second finding is given a suffix rather than being folded into the
   * first - two findings that share an identifier are still two findings, and
   * one of them silently disappearing is a check the person paid for and did
   * not get.
   */
  readonly issueId: string;
  /** As the module sent it, before any suffix. */
  readonly serverId: string;
  readonly code: string;
  readonly severity: Severity;
  /** A key into the dictionary, never a ready-made phrase. */
  readonly titleKey: string;
  readonly params?: Params;
  /** Plain text from the module; it reaches the DOM as a text node. */
  readonly detail?: string;
  readonly anchors: readonly Anchor[];
  readonly evidence: readonly Evidence[];
  readonly actions: readonly IssueAction[];
  readonly cite?: CiteBlock;
};

export type Params = Readonly<Record<string, string | number>>;

/**
 * A place in a document as a module addressed it - what arrived, not where it
 * ended up. Every offset here is counted in code points, which is the unit of
 * the wire and not the unit the browser works in, and the type says so: the
 * resolver turns one of these into a place on the live text, and nothing else
 * in the product is allowed to treat these numbers as positions in a string.
 *
 * The unfamiliar branch is not a defect of the mapper: a `kind` this version
 * does not define arrives, parses, and costs the finding its jump target rather
 * than costing the response.
 */
export type Anchor =
  | {
      readonly kind: "range";
      readonly docId?: string;
      readonly from: CpOffset;
      readonly to: CpOffset;
      readonly quote: string;
      readonly prefix?: string;
      readonly suffix?: string;
      /**
       * The quote is not as long as the range it describes, so one of the two
       * was counted in another unit or the quote was cut short. The place is
       * unusable and the finding keeps it rather than losing the finding; what
       * it costs is the page number beside it and, later, the highlight.
       */
      readonly quoteMismatch?: true;
    }
  | {
      readonly kind: "quote";
      readonly docId?: string;
      readonly quote: string;
      readonly prefix?: string;
      readonly suffix?: string;
      readonly near?: CpOffset;
    }
  | {
      readonly kind: "point";
      readonly docId?: string;
      readonly at: CpOffset;
      readonly prefix?: string;
      readonly suffix?: string;
    }
  | { readonly kind: "bibkey"; readonly docId?: string; readonly bibkey: string }
  | { readonly kind: "document"; readonly docId?: string }
  | { readonly kind: "unknown"; readonly docId?: string; readonly rawKind: string };

export type Evidence =
  | { readonly kind: "doi"; readonly value: string }
  | { readonly kind: "url"; readonly value: string }
  | { readonly kind: "date"; readonly labelKey: string; readonly value: string }
  | { readonly kind: "number"; readonly labelKey: string; readonly value: number }
  | { readonly kind: "text"; readonly labelKey: string; readonly value: string }
  | {
      readonly kind: "source";
      readonly labelKey: string;
      readonly title: string;
      readonly url?: string;
    }
  | { readonly kind: "unknown"; readonly rawKind: string };

export type IssueAction =
  | { readonly kind: "copy"; readonly labelKey?: string; readonly value: string }
  | {
      readonly kind: "replace";
      readonly labelKey?: string;
      readonly value: string;
      readonly anchorIndex: number;
    }
  | { readonly kind: "openSource"; readonly labelKey?: string; readonly url: string }
  | { readonly kind: "download"; readonly labelKey?: string; readonly artifact: number }
  | { readonly kind: "unknown"; readonly rawKind: string };

/** A work as the databases returned it. Every field is third-party text. */
export type BiblioRecord = {
  readonly title: string;
  readonly authors: readonly string[];
  readonly year?: number;
  readonly venue?: string;
  readonly citedBy?: number;
  readonly doi?: string;
  /** The search resolved this DOI while the answer was being assembled. */
  readonly doiVerified?: boolean;
  readonly url?: string;
  readonly openAccess: boolean;
  readonly sources: readonly string[];
  readonly abstract?: string;
};

export type CiteCandidate = BiblioRecord & {
  readonly candidateId: string;
  readonly relevance: number;
  readonly alreadyCited: boolean;
  readonly lowRelevance: boolean;
};

export type CiteBlock = {
  readonly query: string;
  readonly candidates: readonly CiteCandidate[];
};

/**
 * Generated text the client turns into a file; the server hands out no
 * files.
 */
export type Artifact = {
  readonly kind: "bib" | "tex" | "md" | "txt";
  readonly labelKey: string;
  readonly content: string;
};

/**
 * The body of one module's work on one document, fetched once when the module
 * reaches a terminal state. There is no score and no counters here on purpose:
 * two sources of the same numbers drift apart, and these numbers are required
 * to add up.
 */
export type ModuleResult = {
  readonly module: ModuleId;
  readonly docId: string;
  readonly attempt: number;
  /**
   * The unit the offsets in this body are counted in, as the body declares it.
   * It is read rather than assumed, and it is held as a plain string rather
   * than as the one value the contract allows: a body that declares another
   * unit is the case the client has to survive, and the findings in it are
   * still findings - they are shown without places instead of being thrown
   * away.
   */
  readonly offsetUnit: string;
  /**
   * The identifier of the request that brought this body, from `X-Request-Id`.
   * It is on the type because it goes on the screen when the body cannot be
   * trusted: a person writing to support with it is quoting the one line in
   * our logs that describes what they actually received.
   */
  readonly requestId?: string;
  readonly issues: readonly Issue[];
  readonly artifacts: readonly Artifact[];
  /** Every document whose coordinates appear in this body. */
  readonly texts: readonly {
    readonly docId: string;
    readonly textSha256: string;
    readonly cpLength: number;
  }[];
};
