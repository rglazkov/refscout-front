import { type BiblioRecord } from "@/lib/domain";

/**
 * The accepted sources, written out as a BibTeX file.
 *
 * Writing an entry is not parsing one: the fields arrive already separated, and
 * what is left is to put them in the file's shape. It happens in the browser
 * like everything else that can - the records are already here, and the server
 * hands out no files.
 *
 * Only the fields the databases actually returned are written. An empty
 * `journal = {}` in a bibliography is worse than a missing one: it survives
 * into the manuscript and reads as a fact.
 */
export function toBibtex(records: readonly BiblioRecord[]): string {
  const used = new Set<string>();
  return records.map((record) => entry(record, used)).join("\n\n") + "\n";
}

function entry(record: BiblioRecord, used: Set<string>): string {
  const fields: [string, string][] = [["title", record.title]];
  if (record.authors.length > 0) fields.push(["author", record.authors.join(" and ")]);
  if (record.year !== undefined) fields.push(["year", String(record.year)]);
  if (record.venue !== undefined) fields.push(["journal", record.venue]);
  if (record.doi !== undefined) fields.push(["doi", record.doi]);
  if (record.url !== undefined) fields.push(["url", record.url]);

  const width = Math.max(...fields.map(([name]) => name.length));
  const body = fields
    .map(([name, value]) => `  ${name.padEnd(width)} = {${brace(value)}}`)
    .join(",\n");
  return `@article{${key(record, used)},\n${body}\n}`;
}

/**
 * Author, year and the first word of the title, which is what a person reading
 * their own bibliography expects to see. A repeat gets a letter after it, so
 * two papers by the same author in the same year do not collide.
 */
function key(record: BiblioRecord, used: Set<string>): string {
  const author = ascii(record.authors[0]?.split(",")[0] ?? "anon");
  const word = ascii(record.title.split(/\s+/, 1)[0] ?? "");
  const base = `${author}${record.year ?? ""}${word}`.toLowerCase() || "source";
  let candidate = base;
  for (let suffix = 1; used.has(candidate); suffix += 1) {
    candidate = `${base}${String.fromCharCode(96 + suffix)}`;
  }
  used.add(candidate);
  return candidate;
}

function ascii(value: string): string {
  return value.normalize("NFD").replace(/[^A-Za-z0-9]/g, "");
}

/** A brace the file does not close is a file no BibTeX reader will take. */
function brace(value: string): string {
  return value.replace(/[{}]/g, "");
}
