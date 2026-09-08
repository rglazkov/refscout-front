import { type BiblioRecord, type CitationRecord } from "@/lib/domain";

/**
 * A bibliography written out as RIS.
 *
 * Why this format sits beside BibTeX rather than instead of it. BibTeX is the
 * right file for somebody writing in LaTeX and the wrong one for everybody
 * else: a person writing a dissertation in Word cites through Zotero, Mendeley
 * or EndNote, and what those import - and what their Word plugins were built
 * around - is RIS. Handing that person a `.bib` is handing them a file their
 * tools will not open, which is the same as handing them nothing.
 *
 * It is written here rather than fetched from a library because there is
 * nothing to parse: the fields arrive already separated, and what is left is
 * tags and line endings. The one library that would do it is another plugin of
 * citation-js in the bundle for thirty lines of work.
 */

/**
 * Carriage return and line feed, and it is not carelessness about the platform.
 * RIS is an EndNote format and its readers were written against files that end
 * their lines this way; Zotero forgives a bare line feed and the older readers
 * do not, and a person who cannot import the file has no way of finding out
 * why. Nothing else in the product writes CRLF, so it is said here, once, at
 * the format that asks for it.
 */
const EOL = "\r\n";

/**
 * The kinds of work, from the vocabulary a bibliography is read into to the
 * vocabulary this format uses. Anything not named here is `GEN`, which is the
 * format's own word for a work whose kind is not one of its kinds - a reader
 * shows it as a generic reference rather than refusing the entry.
 */
const TYPES: Readonly<Record<string, string>> = {
  "article-journal": "JOUR",
  "article-magazine": "MGZN",
  "article-newspaper": "NEWS",
  article: "JOUR",
  "paper-conference": "CPAPER",
  book: "BOOK",
  chapter: "CHAP",
  thesis: "THES",
  report: "RPRT",
  manuscript: "UNPB",
  patent: "PAT",
  dataset: "DATA",
  webpage: "ELEC",
  software: "COMP",
};

export function toRis(entries: readonly CitationRecord[]): string {
  return entries.map(entry).join("");
}

/**
 * The sources a search found, written out in the same format. They come from a
 * card rather than from a file, so the fields a card never holds - the volume,
 * the pages, the publisher - are absent rather than empty, and the kind of work
 * is the one kind a bibliographic search returns.
 */
export function risFromRecords(records: readonly BiblioRecord[]): string {
  return toRis(
    records.map((record) => ({
      type: "article-journal",
      title: record.title,
      authors: record.authors,
      editors: [],
      ...(record.year === undefined ? {} : { year: String(record.year) }),
      ...(record.venue === undefined ? {} : { container: record.venue }),
      ...(record.doi === undefined ? {} : { doi: record.doi }),
      ...(record.url === undefined ? {} : { url: record.url }),
      ...(record.abstract === undefined ? {} : { abstract: record.abstract }),
      keywords: [],
    })),
  );
}

function entry(record: CitationRecord): string {
  const lines: string[] = [tag("TY", TYPES[record.type] ?? "GEN")];

  // Names are written as they stand in the entry and are never rearranged.
  // A reader takes "Smith, John" and "John Smith" alike, while a rule that
  // turns the second into the first turns "Ludwig van Beethoven" into
  // "Beethoven, Ludwig van" on a good day and into nonsense on an ordinary one.
  for (const author of record.authors) lines.push(tag("AU", author));
  for (const editor of record.editors) lines.push(tag("A2", editor));

  add(lines, "TI", record.title);
  add(lines, "PY", record.year);
  add(lines, "JO", record.container);
  add(lines, "VL", record.volume);
  add(lines, "IS", record.issue);
  pages(lines, record.pages);
  add(lines, "PB", record.publisher);
  add(lines, "CY", record.place);
  add(lines, "ET", record.edition);
  add(lines, "SN", record.isbn ?? record.issn);
  add(lines, "DO", record.doi);
  add(lines, "UR", record.url);
  add(lines, "AB", record.abstract);
  for (const keyword of record.keywords) lines.push(tag("KW", keyword));
  add(lines, "N1", record.note);

  // `ER` closes an entry and the blank line after it separates one from the
  // next. Readers that split the file on blank lines need it, and the rest
  // ignore it.
  lines.push(tag("ER", ""));
  return lines.join("") + EOL;
}

function add(lines: string[], name: string, value: string | undefined): void {
  if (value !== undefined && value !== "") lines.push(tag(name, value));
}

/**
 * A range written as its two ends, because that is what the format has. An
 * entry that gives a single page, or an article number in place of a range,
 * has a start and no end - which is what the entry itself said.
 */
function pages(lines: string[], range: string | undefined): void {
  if (range === undefined || range === "") return;
  const [first, last] = range.split(/\s*(?:--?|–|—)\s*/, 2);
  add(lines, "SP", first);
  add(lines, "EP", last);
}

/**
 * One line, in the shape the format fixes: two spaces, a hyphen and a space
 * between the tag and its value. A value that runs over several lines is folded
 * onto one - a bare line feed inside a value ends the field as far as a reader
 * is concerned, and an abstract copied out of a PDF is full of them.
 */
function tag(name: string, value: string): string {
  return `${name}  - ${value.replace(/\s+/g, " ").trim()}${EOL}`;
}
