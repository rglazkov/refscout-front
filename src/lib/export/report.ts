import { lineAt, lineStarts, pageOf } from "@/lib/docs";
import {
  isResolved,
  type Counts,
  type Issue,
  type ModuleId,
  type PageSpan,
  type Place,
  type Severity,
} from "@/lib/domain";

/**
 * The findings report, as a structure rather than as a file.
 *
 * In this first section the report is the main thing the product produces: a
 * person takes it away and works through their manuscript from it. What they
 * get is a PDF, and this module stops one step short of that - it turns a
 * finished job into the report's own shape, with every piece of wording already
 * chosen, and lib/export/pdf sets that shape on paper.
 *
 * The split is worth the extra type. Laying out a page is arithmetic about
 * widths and page breaks, and deciding what a report says is neither; keeping
 * them apart is what lets the second be read and tested without a font in
 * sight. It is also why nothing here is a function: this structure is posted to
 * a worker, and only data crosses that boundary.
 *
 * The text inside it is someone else's - a sentence out of a manuscript, a name
 * off somebody's disk - and it is carried through verbatim. Nothing here is
 * escaped, and that is not an omission: a PDF has no markup for a character to
 * be mistaken for, so the asterisks, underscores and brackets a manuscript is
 * full of are drawn as the characters they are. Several of the checks are about
 * exactly those characters, which is why it matters that the reader sees them.
 */
export type ReportInput = {
  readonly title: string;
  readonly generatedAt: string;
  readonly documents: readonly ReportDocument[];
  /**
   * The dictionary, passed in: lib/export has no business holding wording. The
   * third argument is what to say when this release has no wording for the key,
   * which is an ordinary thing to receive - the server gains a check before the
   * client that draws it is deployed.
   */
  readonly phrase: (
    key: string,
    params?: Readonly<Record<string, string | number>>,
    fallback?: string,
  ) => string;
  readonly labels: ReportLabels;
};

/**
 * One finding as the report needs it: what it says, and where it ended up on
 * the text the browser holds. The places are the resolver's answer rather than
 * the module's offsets, so a line number in the report is a line the reader can
 * count to in the file they downloaded beside it.
 */
export type ReportIssue = {
  readonly docId: string;
  readonly module: ModuleId;
  readonly issue: Issue;
  readonly places: readonly Place[];
};

export type ReportDocument = {
  readonly docId: string;
  readonly name: string;
  readonly counts: Counts;
  readonly text?: string;
  readonly pages?: readonly PageSpan[];
  /**
   * The text was corrected after the checks read it. The numbers below then
   * describe where things were at the moment of the check, and the reader is
   * told so once, under the name of the document: a line number that has
   * quietly moved is worse than no line number, because it looks exactly like
   * one that is right.
   */
  readonly editedAfterRun?: boolean;
  readonly issues: readonly ReportIssue[];
  /** The keys of the findings the person marked as dealt with. */
  readonly fixed: ReadonlySet<string>;
  /** The keys of the findings the person turned down. */
  readonly ignored: ReadonlySet<string>;
  /**
   * The modules whose bodies were counted over a different text than the one
   * the browser holds. Their findings keep their place in the report and lose
   * their line and page numbers: a number worked out from coordinates for
   * another version of the document would send the reader to the wrong line
   * with every appearance of precision.
   */
  readonly unanchored?: ReadonlySet<string>;
};

export type ReportLabels = {
  readonly severity: Readonly<Record<Severity, string>>;
  readonly module: (module: string) => string;
  readonly line: string;
  readonly page: string;
  readonly fixed: string;
  readonly ignored: string;
  /** Introduces the replacement a module proposed for a place. */
  readonly replacement: string;
  /** Says that a check read a different version of this document. */
  readonly unanchored: string;
  /** Says that the text was corrected after the checks read it. */
  readonly editedAfterRun: string;
  /** Says that this particular fragment has been edited since. */
  readonly edited: string;
  /** Says that the place would not resolve at all. */
  readonly lost: string;
  readonly nothing: string;
  /** Names a digital object identifier, which arrives without a label of its own. */
  readonly doi: string;
};

/**
 * The whole report, worded and ordered, with nothing left to decide but where
 * on the page each piece goes.
 */
export type ReportDoc = {
  readonly title: string;
  readonly generatedAt: string;
  readonly documents: readonly ReportSection[];
};

export type ReportSection = {
  readonly name: string;
  /** Drawn as counted dots rather than as a sentence, so it is read at a glance. */
  readonly counts: Counts;
  /** Said once under the name of the document, before any number in it. */
  readonly notes: readonly string[];
  /** Stands instead of the checks when this document came back clean. */
  readonly nothing: string | null;
  readonly checks: readonly ReportCheck[];
};

export type ReportCheck = {
  readonly name: string;
  /** Why this check's findings carry no line and page numbers, where they do not. */
  readonly note: string | null;
  readonly findings: readonly ReportFinding[];
};

export type ReportFinding = {
  readonly severity: Severity;
  readonly severityLabel: string;
  readonly title: string;
  /** What the person did with it - marked it fixed, or turned it down. */
  readonly mark: string | null;
  readonly places: readonly ReportPlace[];
  readonly detail: string | null;
  /**
   * The typed facts the module answered with. They are on the card the person
   * opened on the screen, and the report carries them for the same reason the
   * card does: a finding read without them is a title and a line number.
   */
  readonly facts: readonly ReportFact[];
  readonly replacement: { readonly label: string; readonly text: string } | null;
};

/**
 * One fact under a finding: a DOI, an address, a date, a count, a named source.
 * The label is a word and the value is a thing to be compared or copied, so
 * they are kept apart - the value is set in the mono face and the label is not.
 * A fact whose label this release has no wording for keeps its value and loses
 * the word in front of it, because the value is the part worth reading.
 */
export type ReportFact = { readonly label: string | null; readonly value: string };

export type ReportPlace = {
  readonly where: readonly ReportWhere[];
  /** A fragment of the manuscript the module was reading at this place. */
  readonly quote: string | null;
  /**
   * The entry of a bibliography this place names, where that is what it has
   * instead of a fragment. It is kept apart from the quotation because the two
   * are different things and are set differently: a sentence out of somebody's
   * manuscript is prose, and a key is an identifier.
   */
  readonly bibkey: string | null;
};

/**
 * A piece of "where this is". The number is kept apart from the word in front
 * of it because the two are set in different faces: a quantity belongs in the
 * mono face wherever it appears in this product. A part with no number is a
 * statement rather than a coordinate - that the fragment has been edited since,
 * or that the place would not resolve at all.
 */
export type ReportWhere = { readonly label: string; readonly value: string | null };

/**
 * What a module offers to put in place of what is there. It is carried into the
 * report because the report is what a person works from: they are at their
 * manuscript with the findings beside them, and the replacement under the
 * finding is the difference between reading about a problem and fixing it.
 */
function replacementOf(issue: Issue): string | null {
  const action = issue.actions.find((candidate) => candidate.kind === "replace");
  return action === undefined ? null : action.value;
}

function some(text: string | undefined): string | null {
  return text === undefined || text === "" ? null : text;
}

/**
 * The module's typed facts, worded. Every kind the contract defines is drawn
 * from the same two fields, which is what lets a new module arrive with nothing
 * but entries in the dictionary; a kind this release does not know is passed
 * over and the rest of the finding is kept.
 */
function factsOf(input: ReportInput, issue: Issue): readonly ReportFact[] {
  const word = (key: string): string | null => {
    const label = input.phrase(key, undefined, "");
    return label === "" ? null : label;
  };

  return issue.evidence.flatMap((fact): readonly ReportFact[] => {
    switch (fact.kind) {
      case "doi":
        return [{ label: input.labels.doi, value: fact.value }];
      case "url":
        return [{ label: null, value: fact.value }];
      case "date":
      case "text":
        return [{ label: word(fact.labelKey), value: fact.value }];
      case "number":
        return [{ label: word(fact.labelKey), value: String(fact.value) }];
      case "source":
        return [{ label: word(fact.labelKey), value: fact.title }];
      default:
        return [];
    }
  });
}

/**
 * A quote is drawn as one run of prose however many lines it held: the line
 * breaks inside a fragment belong to the manuscript's own wrapping, and
 * carrying them into a narrower column here would break it twice.
 */
function asQuote(text: string): string {
  return text.replace(/\r?\n/g, " ").trim();
}

export function buildIssueReport(input: ReportInput): ReportDoc {
  return {
    title: input.title,
    generatedAt: input.generatedAt,
    documents: input.documents.map((document) => section(input, document)),
  };
}

function section(input: ReportInput, document: ReportDocument): ReportSection {
  /*
   * Said once, at the top of the document it is about. Somebody who corrected
   * their manuscript and then took the report away has a file in one hand and a
   * set of line numbers in the other, and the two describe different moments;
   * that is worth a sentence, and it is worth it before the numbers rather than
   * after them.
   */
  const notes = document.editedAfterRun === true ? [input.labels.editedAfterRun] : [];

  if (document.issues.length === 0) {
    return {
      name: document.name,
      counts: document.counts,
      notes,
      nothing: input.labels.nothing,
      checks: [],
    };
  }

  // One pass over the text for the whole document, however many findings point
  // into it.
  const starts = document.text === undefined ? undefined : lineStarts(document.text);
  const checks: { name: string; note: string | null; findings: ReportFinding[] }[] = [];

  for (const placed of document.issues) {
    /*
     * A body counted over another text keeps its findings and loses its
     * numbers: the reader is told once, under the name of that check, rather
     * than being sent to a line that has moved.
     */
    const anchored = document.unanchored?.has(placed.module) !== true;
    const name = input.labels.module(placed.module);
    let check = checks.at(-1);
    if (check === undefined || check.name !== name) {
      check = { name, note: anchored ? null : input.labels.unanchored, findings: [] };
      checks.push(check);
    }
    check.findings.push(finding(input, document, placed, anchored, starts));
  }

  return { name: document.name, counts: document.counts, notes, nothing: null, checks };
}

function finding(
  input: ReportInput,
  document: ReportDocument,
  placed: ReportIssue,
  anchored: boolean,
  starts: readonly number[] | undefined,
): ReportFinding {
  const { issue } = placed;
  const key = `${placed.docId}:${placed.module}:${issue.issueId}`;
  const replacement = replacementOf(issue);

  return {
    severity: issue.severity,
    severityLabel: input.labels.severity[issue.severity],
    title: input.phrase(issue.titleKey, issue.params),
    mark: document.fixed.has(key)
      ? input.labels.fixed
      : document.ignored.has(key)
        ? input.labels.ignored
        : null,
    places: placed.places.map((place) =>
      placeOf(input, document, place, anchored, starts),
    ),
    detail:
      issue.detail === undefined || issue.detail === ""
        ? null
        : issue.detail.replace(/\r?\n/g, " "),
    facts: factsOf(input, issue),
    replacement:
      replacement === null || replacement === ""
        ? null
        : { label: input.labels.replacement, text: asQuote(replacement) },
  };
}

function placeOf(
  input: ReportInput,
  document: ReportDocument,
  place: Place,
  anchored: boolean,
  starts: readonly number[] | undefined,
): ReportPlace {
  const offset =
    anchored && isResolved(place) && place.edited !== true
      ? (place.anchor ?? null)
      : null;
  const where: ReportWhere[] = [];

  if (offset !== null && starts !== undefined) {
    where.push({ label: input.labels.line, value: String(lineAt(starts, offset)) });
    const page = pageOf(document.pages, offset);
    if (page !== null) where.push({ label: input.labels.page, value: String(page) });
  }

  /*
   * A place that could not be worked out, and one whose text has been corrected
   * since, are both said in words rather than left as a finding with nothing
   * beside it. The reader can tell the difference between "we could not find
   * this" and "you have already changed this", and they mean different things
   * about what to do next.
   */
  if (anchored && place.edited === true) {
    where.push({ label: input.labels.edited, value: null });
  } else if (anchored && place.status === "lost") {
    where.push({ label: input.labels.lost, value: null });
  }

  const quote = some(place.quote);
  return {
    where,
    quote: quote === null ? null : asQuote(quote),
    bibkey: some(place.bibkey),
  };
}
