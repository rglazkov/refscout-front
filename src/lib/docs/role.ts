import {
  type AttachmentSlot,
  type DetectedKind,
  type DocRole,
  type ModuleId,
  type SourceFormat,
} from "@/lib/domain";

/**
 * What the document itself is, read from its format and its content rather than
 * from what is ticked on it. BibCheck and Glossary each run on either half of a
 * pair - on the manuscript that cites a bibliography and on the bibliography
 * itself - so the ticks alone cannot say which half this is.
 */
export type SelfKind = "bibliography" | "glossary" | "other";

export function selfKind(format: SourceFormat, detected: DetectedKind): SelfKind {
  if (detected === "bibtex") return "bibliography";
  if (format === "gls") return "glossary";
  return "other";
}

/**
 * The role a document plays, derived from the checks that are ticked on it and
 * from the slot it was attached to. The user is never asked: the card shows
 * what will be done, and the abstraction the server needs is computed from it.
 *
 * An attachment answers first, because its slot says outright what it is: the
 * bibliography a manuscript cites, the glossary file it should not redefine,
 * the venue's requirements. Then what the document is in its own right, which
 * settles the case the ticks cannot: a bibliography that names the manuscript
 * citing it is still a bibliography, and BibCheck is ticked on it all the same.
 * Only after that do the ticks decide - anything with a second text hanging off
 * it is the document that reads, PreSubmit and Cite are checks of a manuscript,
 * and a lone tick names the thing that check reads.
 */
export function roleFromChecks(
  checks: readonly ModuleId[],
  options: {
    readonly slot?: AttachmentSlot;
    readonly self?: SelfKind;
    readonly hasCompanions?: boolean;
  } = {},
): DocRole {
  if (options.slot === "venue") return "venue-requirements";
  if (options.slot === "bibcheck") return "bibliography";
  if (options.slot === "glossary") return "glossary";
  if (options.self === "bibliography") return "bibliography";
  if (options.self === "glossary") return "glossary";
  if (options.hasCompanions === true) return "manuscript";
  if (checks.includes("presubmit") || checks.includes("cite")) return "manuscript";
  if (checks.includes("bibcheck")) return "bibliography";
  if (checks.includes("glossary")) return "glossary";
  return "unknown";
}
