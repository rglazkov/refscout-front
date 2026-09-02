import {
  type Anchor,
  type Artifact,
  type BiblioRecord,
  type CiteBlock,
  type CiteCandidate,
  type Evidence,
  type Issue,
  type IssueAction,
  type ModuleResult,
} from "@/lib/domain";
import {
  type Anchor as WireAnchor,
  type Artifact as WireArtifact,
  type BiblioRecord as WireBiblioRecord,
  type CiteBlock as WireCiteBlock,
  type CiteCandidate as WireCiteCandidate,
  type Evidence as WireEvidence,
  type Issue as WireIssue,
  type IssueAction as WireIssueAction,
  type ModuleResult as WireModuleResult,
} from "@/lib/api/wire";
// Before the schemas themselves: the flag it sets is read as they are built.
import "@/lib/api/schemas/jitless";
import {
  zActionCopy,
  zActionDownload,
  zActionOpenSource,
  zActionReplace,
  zAnchorBibkey,
  zAnchorPoint,
  zAnchorQuote,
  zAnchorRange,
  zEvidenceDate,
  zEvidenceDoi,
  zEvidenceNumber,
  zEvidenceSource,
  zEvidenceText,
  zEvidenceUrl,
} from "@/lib/api/wire/zod.gen";

/**
 * The seam. The signature is the whole point: the day the server's shape moves,
 * it stops compiling here, in one directory, rather than showing up as
 * `undefined` inside JSX.
 *
 * The branches are parsed rather than narrowed by their tag. The open branch of
 * each union accepts any `kind` at all, so a check on the tag alone tells
 * TypeScript nothing - and an unfamiliar kind has to survive, costing the
 * finding its jump target rather than costing the whole response.
 */
export function toIssue(w: WireIssue): Issue {
  return {
    issueId: w.issueId,
    code: w.code,
    severity: w.severity,
    titleKey: w.titleKey,
    ...(w.params === undefined ? {} : { params: w.params }),
    ...(w.detail === undefined ? {} : { detail: w.detail }),
    anchors: w.anchors.map(toAnchor),
    evidence: (w.evidence ?? []).map(toEvidence),
    actions: (w.actions ?? []).map(toAction),
    // Nothing sets it yet. The field is here from the start because a field
    // added to the domain later drags the mapper, the schema and the wire
    // types along with it.
    stale: false,
    ...(w.cite === undefined ? {} : { cite: toCiteBlock(w.cite) }),
  };
}

export function toAnchor(w: WireAnchor): Anchor {
  switch (w.kind) {
    case "range": {
      const a = zAnchorRange.parse(w);
      return {
        kind: "range",
        ...(a.docId === undefined ? {} : { docId: a.docId }),
        from: a.from,
        to: a.to,
        quote: a.quote,
        ...(a.prefix === undefined ? {} : { prefix: a.prefix }),
        ...(a.suffix === undefined ? {} : { suffix: a.suffix }),
      };
    }
    case "quote": {
      const a = zAnchorQuote.parse(w);
      return {
        kind: "quote",
        ...(a.docId === undefined ? {} : { docId: a.docId }),
        quote: a.quote,
        ...(a.prefix === undefined ? {} : { prefix: a.prefix }),
        ...(a.suffix === undefined ? {} : { suffix: a.suffix }),
        ...(a.near === undefined ? {} : { near: a.near }),
      };
    }
    case "point": {
      const a = zAnchorPoint.parse(w);
      return {
        kind: "point",
        ...(a.docId === undefined ? {} : { docId: a.docId }),
        at: a.at,
        ...(a.prefix === undefined ? {} : { prefix: a.prefix }),
        ...(a.suffix === undefined ? {} : { suffix: a.suffix }),
      };
    }
    case "bibkey": {
      const a = zAnchorBibkey.parse(w);
      return {
        kind: "bibkey",
        ...(a.docId === undefined ? {} : { docId: a.docId }),
        bibkey: a.bibkey,
      };
    }
    case "document":
      return {
        kind: "document",
        ...(w.docId === undefined ? {} : { docId: w.docId }),
      };
    default:
      return {
        kind: "unknown",
        rawKind: w.kind,
        ...(w.docId === undefined ? {} : { docId: w.docId }),
      };
  }
}

export function toEvidence(w: WireEvidence): Evidence {
  switch (w.kind) {
    case "doi":
      return { kind: "doi", value: zEvidenceDoi.parse(w).value };
    case "url":
      return { kind: "url", value: zEvidenceUrl.parse(w).value };
    case "date": {
      const e = zEvidenceDate.parse(w);
      return { kind: "date", labelKey: e.labelKey, value: e.value };
    }
    case "number": {
      const e = zEvidenceNumber.parse(w);
      return { kind: "number", labelKey: e.labelKey, value: e.value };
    }
    case "text": {
      const e = zEvidenceText.parse(w);
      return { kind: "text", labelKey: e.labelKey, value: e.value };
    }
    case "source": {
      const e = zEvidenceSource.parse(w);
      return {
        kind: "source",
        labelKey: e.labelKey,
        title: e.title,
        ...(e.url === undefined ? {} : { url: e.url }),
      };
    }
    default:
      return { kind: "unknown", rawKind: w.kind };
  }
}

export function toAction(w: WireIssueAction): IssueAction {
  switch (w.kind) {
    case "copy": {
      const a = zActionCopy.parse(w);
      return {
        kind: "copy",
        value: a.value,
        ...(a.labelKey === undefined ? {} : { labelKey: a.labelKey }),
      };
    }
    case "replace": {
      const a = zActionReplace.parse(w);
      return {
        kind: "replace",
        value: a.value,
        anchorIndex: a.anchorIndex ?? 0,
        ...(a.labelKey === undefined ? {} : { labelKey: a.labelKey }),
      };
    }
    case "openSource": {
      const a = zActionOpenSource.parse(w);
      return {
        kind: "openSource",
        url: a.url,
        ...(a.labelKey === undefined ? {} : { labelKey: a.labelKey }),
      };
    }
    case "download": {
      const a = zActionDownload.parse(w);
      return {
        kind: "download",
        artifact: a.artifact,
        ...(a.labelKey === undefined ? {} : { labelKey: a.labelKey }),
      };
    }
    default:
      return { kind: "unknown", rawKind: w.kind };
  }
}

export function toArtifact(w: WireArtifact): Artifact {
  return { kind: w.kind, labelKey: w.labelKey, content: w.content };
}

export function toModuleResult(w: WireModuleResult): ModuleResult {
  return {
    module: w.module,
    docId: w.docId,
    attempt: w.attempt,
    issues: w.issues.map(toIssue),
    artifacts: (w.artifacts ?? []).map(toArtifact),
    texts: w.texts.map((text) => ({
      docId: text.docId,
      textSha256: text.textSha256,
      cpLength: text.cpLength,
    })),
  };
}

function toBiblioRecord(w: WireBiblioRecord): BiblioRecord {
  return {
    title: w.title,
    authors: w.authors,
    ...(w.year === undefined ? {} : { year: w.year }),
    ...(w.venue === undefined ? {} : { venue: w.venue }),
    ...(w.citedBy === undefined ? {} : { citedBy: w.citedBy }),
    ...(w.doi === undefined ? {} : { doi: w.doi }),
    ...(w.url === undefined ? {} : { url: w.url }),
    openAccess: w.openAccess,
    sources: w.sources,
    ...(w.abstract === undefined ? {} : { abstract: w.abstract }),
  };
}

function toCiteCandidate(w: WireCiteCandidate): CiteCandidate {
  return {
    ...toBiblioRecord(w),
    candidateId: w.candidateId,
    relevance: w.relevance,
    alreadyCited: w.alreadyCited,
    lowRelevance: w.lowRelevance,
  };
}

function toCiteBlock(w: WireCiteBlock): CiteBlock {
  return { query: w.query, candidates: w.candidates.map(toCiteCandidate) };
}
