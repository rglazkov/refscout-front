"use client";

import { type Evidence } from "@/lib/domain";
import { useWording } from "@/lib/i18n";

/**
 * The typed facts under a finding, drawn from the kinds the contract defines
 * rather than from anything a particular module knows. A DOI, an address, a
 * date, a count, a named source: every module that answers in these needs no
 * renderer of its own, which is what makes connecting one a dictionary and
 * nothing else.
 *
 * The label is a sentence and the value is a thing to be compared or copied, so
 * the value is set in the mono face and the label is not.
 */
export function EvidenceList({ facts }: { readonly facts: readonly Evidence[] }) {
  if (facts.length === 0) return null;
  return (
    <ul className="space-y-1 text-xs text-muted-foreground">
      {facts.map((fact, index) => (
        <li key={index}>
          <Fact fact={fact} />
        </li>
      ))}
    </ul>
  );
}

function Fact({ fact }: { readonly fact: Evidence }) {
  switch (fact.kind) {
    case "doi":
      return (
        <>
          DOI <span className="font-mono">{fact.value}</span>
        </>
      );
    case "url":
      return (
        <a
          href={fact.value}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono underline"
        >
          {fact.value}
        </a>
      );
    case "date":
    case "number":
    case "text":
      return (
        <>
          <FactLabel labelKey={fact.labelKey} />
          <span className="font-mono">{fact.value}</span>
        </>
      );
    case "source":
      return (
        <>
          <FactLabel labelKey={fact.labelKey} />
          {fact.title}
        </>
      );
    default:
      // A fact of an unfamiliar kind is passed over, and the rest is shown.
      return null;
  }
}

/**
 * The name of one fact. A key this release has no wording for leaves the value
 * standing on its own rather than putting a sentence of apology where a word
 * like "DOI" belongs: the value is the part that is worth reading, and a
 * missing label costs nothing beside it.
 */
function FactLabel({ labelKey }: { readonly labelKey: string }) {
  const phrase = useWording();
  const label = phrase(labelKey, undefined, "");
  return label === "" ? null : <>{label}: </>;
}
