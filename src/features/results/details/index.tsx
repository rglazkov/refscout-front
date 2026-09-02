"use client";

import { type Issue, type ModuleId } from "@/lib/domain";

import { EvidenceList } from "./evidence";

/**
 * What connecting a module to this interface consists of: its codes and
 * wordings in the dictionary, and one component that reads its facts. Nothing
 * else - no branch in the results screen, none in the counters, none in the
 * list inside a card. This map is where a module says which component that is,
 * and it is the only place a module's name may decide how something is drawn.
 *
 * Three of the four point at the same component today, and that is the claim
 * rather than an oversight: the facts they answer with are the kinds the
 * contract defines, so the shared renderer draws them without knowing whose
 * they are. A module that later answers with something of its own gets an entry
 * here and touches nothing else; the day that requires a change anywhere else,
 * the first connection was made too particular.
 *
 * Cite is the exception and is not drawn here at all: it proposes sources
 * rather than reporting problems, and a claim with its candidates is a
 * screenful, so its card opens an overlay of its own.
 */
type DetailsProps = { readonly issue: Issue };

const renderers: Readonly<Record<ModuleId, (props: DetailsProps) => React.ReactNode>> = {
  bibcheck: TypedFacts,
  glossary: TypedFacts,
  presubmit: TypedFacts,
  cite: TypedFacts,
};

export function IssueDetails({
  module,
  issue,
}: {
  readonly module: ModuleId;
  readonly issue: Issue;
}) {
  const Renderer = renderers[module];
  return <Renderer issue={issue} />;
}

function TypedFacts({ issue }: DetailsProps) {
  return <EvidenceList facts={issue.evidence} />;
}
