import {
  type DetectedKind,
  type ModuleId,
  type SourceFormat,
  moduleIds,
} from "@/lib/domain";

/**
 * What the checks are proposed from. The signals are read from the text rather
 * than from the extension: a file called `notes.txt` that begins with
 * `@article{` is a bibliography, and a `.tex` without `\documentclass` is not a
 * manuscript.
 *
 * Nothing here forbids anything. Every check is available on every document -
 * the automatic proposal decides what to suggest and never what to allow. A row
 * of the table only says which boxes start ticked.
 */
const BIBTEX_ENTRY =
  /^\s*@(article|inproceedings|book|incollection|misc|phdthesis|techreport)\s*\{/im;
const LATEX_CLASS = /\\documentclass\s*(\[[^\]]*\])?\s*\{/;
const LATEX_BIBLIOGRAPHY =
  /\\(bibliography|addbibresource|printbibliography|begin\{thebibliography\})/;
const LATEX_ACRONYM = /\\(newacronym|newglossaryentry|acrshort|acrlong)\b/g;
const MARKDOWN_HEADING = /^#{1,6}\s+\S/m;

/** The extension, lowercased and without the dot. */
export function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return match?.[1]?.toLowerCase() ?? "";
}

export function formatOf(fileName: string): SourceFormat | null {
  switch (extensionOf(fileName)) {
    case "pdf":
      return "pdf";
    case "docx":
      return "docx";
    case "md":
    case "markdown":
      return "md";
    case "tex":
      return "tex";
    case "bib":
    case "bibtex":
      return "bib";
    case "gls":
      return "gls";
    case "txt":
    case "text":
      return "txt";
    default:
      return null;
  }
}

/** What the content turned out to be, whatever the extension claimed. */
export function detectKind(text: string, format: SourceFormat): DetectedKind {
  if (BIBTEX_ENTRY.test(text)) return "bibtex";
  if (LATEX_CLASS.test(text) || countMatches(text, LATEX_ACRONYM) > 0) return "latex";
  if (format === "md" && MARKDOWN_HEADING.test(text)) return "markdown";
  if (format === "tex" || format === "gls") return "latex";
  if (format === "md") return "markdown";
  // A Word file is markdown from the moment it is converted, and that is what
  // is read, corrected, sent and shown - so it is markdown here too.
  if (format === "docx") return "markdown";
  if (format === "bib") return "bibtex";
  if (format === "pdf") return "pdf";
  if (text.trim() === "") return "unknown";
  return "text";
}

/**
 * The checks a document arrives with ticked. The result is a set, because one
 * document feeds several checks: a manuscript usually carries both PreSubmit
 * and Cite, and a `.tex` with a bibliography inside carries BibCheck as well.
 */
export function proposeChecks(text: string, format: SourceFormat): readonly ModuleId[] {
  const proposed = new Set<ModuleId>();

  const acronyms = countMatches(text, LATEX_ACRONYM);
  // A bibliography brought on its own is a document to be checked: BibCheck
  // finds duplicate keys, broken entries and retracted works in it without any
  // manuscript at all, and the manuscript that cites it is what the card then
  // offers to add.
  const isBibliography = format === "bib" || BIBTEX_ENTRY.test(text);
  const isManuscript =
    format === "pdf" ||
    format === "docx" ||
    LATEX_CLASS.test(text) ||
    (format === "md" && MARKDOWN_HEADING.test(text));

  if (isManuscript) {
    proposed.add("presubmit");
    proposed.add("cite");
    if (LATEX_BIBLIOGRAPHY.test(text)) proposed.add("bibcheck");
  }

  // A glossary is a file where acronym declarations are what the file is made
  // of, rather than a manuscript that happens to declare three of them.
  if (acronyms > 0 && (format === "gls" || (!isManuscript && acronyms >= 3))) {
    proposed.add("glossary");
  }

  if (isBibliography) proposed.add("bibcheck");

  // Plain prose with no markup at all is most often a venue's requirements
  // pasted in, and that is not a check but an input to one: nothing is ticked,
  // and the person says on the card what the document is for.
  return moduleIds.filter((id) => proposed.has(id));
}

function countMatches(text: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) !== null) count += 1;
  pattern.lastIndex = 0;
  return count;
}
