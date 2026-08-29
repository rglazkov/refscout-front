import { type ModuleId, type Severity } from "./ids";

/**
 * One finding, in the shape the card that draws it needs (M1.1.2). The domain
 * is designed from the screens, so what is here is what §10 puts on a finding:
 * a severity, a phrase key with its substitutions, the places it points at,
 * typed facts, offered actions, and whether an edit has left it behind.
 */
export type Issue = {
  readonly issueId: string;
  readonly code: string;
  readonly severity: Severity;
  /** A key into the dictionary, never a ready-made phrase (§15). */
  readonly titleKey: string;
  readonly params?: Params;
  /** Plain text from the module; it reaches the DOM as a text node (§19). */
  readonly detail?: string;
  readonly anchors: readonly Anchor[];
  readonly evidence: readonly Evidence[];
  readonly actions: readonly IssueAction[];
  /**
   * The text moved under this finding and the place is no longer trustworthy.
   * Nothing sets it before M9, and it is in the type from the start because a
   * field added later drags the mapper, the schema and the contract with it.
   */
  readonly stale: boolean;
  readonly cite?: CiteBlock;
};

export type Params = Readonly<Record<string, string | number>>;

/**
 * A place in a document. The unfamiliar branch is not a defect of the mapper:
 * a `kind` this version does not define arrives, parses, and costs the finding
 * its jump target rather than costing the response (§5.9 of the contract).
 */
export type Anchor =
  | {
      readonly kind: "range";
      readonly docId?: string;
      readonly from: number;
      readonly to: number;
      readonly quote: string;
      readonly prefix?: string;
      readonly suffix?: string;
    }
  | {
      readonly kind: "quote";
      readonly docId?: string;
      readonly quote: string;
      readonly prefix?: string;
      readonly suffix?: string;
      readonly near?: number;
    }
  | {
      readonly kind: "point";
      readonly docId?: string;
      readonly at: number;
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

/** A work as the databases returned it. Every field is third-party text (§19). */
export type BiblioRecord = {
  readonly title: string;
  readonly authors: readonly string[];
  readonly year?: number;
  readonly venue?: string;
  readonly citedBy?: number;
  readonly doi?: string;
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

/** Generated text the client turns into a file; the server hands out no files (§9). */
export type Artifact = {
  readonly kind: "bib" | "tex" | "md" | "txt";
  readonly labelKey: string;
  readonly content: string;
};

/**
 * The body of one module's work on one document, fetched once when the module
 * reaches a terminal state. There is no score and no counters here on purpose:
 * two sources of the same numbers drift apart, and these numbers are required
 * to add up (§9, §18).
 */
export type ModuleResult = {
  readonly module: ModuleId;
  readonly docId: string;
  readonly attempt: number;
  readonly issues: readonly Issue[];
  readonly artifacts: readonly Artifact[];
  /** Every document whose coordinates appear in this body (§5.2 of the contract). */
  readonly texts: readonly {
    readonly docId: string;
    readonly textSha256: string;
    readonly cpLength: number;
  }[];
};
