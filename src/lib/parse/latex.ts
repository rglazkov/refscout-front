import { getParser } from "@unified-latex/unified-latex-util-parse";

import { type BibSpan } from "@/lib/domain";

import { duplicateFindings } from "./bib";
import { type Reading, emptyReading, unreadable } from "./reading";

/**
 * LaTeX, read by unified-latex. `.tex` and `.gls` are one format and one
 * reading: a glossary file is a LaTeX source that happens to be nothing but
 * definitions.
 *
 * The tree is not the document and never becomes it. What the person edits,
 * sends and downloads is the source exactly as they wrote it - commands,
 * comments, escaping and their own spacing included - and what the tree is for
 * is the question the source cannot answer by being looked at: where each entry
 * of a bibliography written inside the file sits, so that a finding naming an
 * entry key can be shown against the entry it names.
 *
 * A regular expression would find `\bibitem` too, and would also find it inside
 * a comment, inside a verbatim block and inside a macro that redefines it. The
 * tree knows the difference, which is the whole reason for reading one.
 */
type Node = {
  readonly type: string;
  readonly content?: string | readonly Node[];
  readonly args?: readonly Node[];
  readonly env?: string | readonly Node[];
  readonly openMark?: string;
  readonly position?: {
    readonly start: { offset: number };
    readonly end: { offset: number };
  };
};

export function readLatex(text: string): Reading {
  let root: Node;
  try {
    root = getParser().parse(text);
  } catch {
    return unreadable();
  }

  const bibEntries: BibSpan[] = [];
  for (const bibliography of environments(root, "thebibliography")) {
    bibEntries.push(...entriesOf(bibliography));
  }
  if (bibEntries.length === 0) return emptyReading();

  return {
    bibEntries,
    localFindings: duplicateFindings(bibEntries.map((entry) => entry.key)),
    complete: true,
  };
}

/**
 * Where each `\bibitem` of one bibliography sits. An entry runs from its own
 * command to the next one, and the last runs to the end of what the environment
 * holds - which is how the environment is laid out on the page and how a reader
 * of the file understands it.
 */
function entriesOf(bibliography: Node): readonly BibSpan[] {
  const items: { key: string; from: number }[] = [];
  for (const macro of macros(bibliography)) {
    if (macro.content !== "bibitem") continue;
    const key = firstMandatory(macro);
    const from = macro.position?.start.offset;
    if (key === undefined || from === undefined) continue;
    items.push({ key, from });
  }

  const end = lastOffset(bibliography);
  return items.map((item, index) => ({
    key: item.key,
    from: item.from,
    to: items[index + 1]?.from ?? end,
  }));
}

/**
 * The text of a macro's first argument written in braces. The optional argument
 * of `\bibitem[Jo20]{jones2020}` is the label a reader sees and is not the key,
 * so the marks are what decides rather than the position in the list.
 */
function firstMandatory(macro: Node): string | undefined {
  for (const argument of macro.args ?? []) {
    if (argument.openMark !== "{") continue;
    return flatten(argument).trim();
  }
  return undefined;
}

/** Every string a node holds, in order and without the commands between them. */
function flatten(node: Node): string {
  if (typeof node.content === "string") return node.type === "string" ? node.content : "";
  let text = "";
  for (const child of node.content ?? []) text += flatten(child);
  return text;
}

/**
 * The tree is walked here rather than with the visitor package beside it. What
 * is asked of it is "every node under this one", the answer is six lines, and
 * the alternative is a second dependency for a depth-first walk.
 */
function* nodes(node: Node): Generator<Node> {
  yield node;
  if (typeof node.content !== "string") {
    for (const child of node.content ?? []) yield* nodes(child);
  }
  for (const argument of node.args ?? []) yield* nodes(argument);
}

function* macros(node: Node): Generator<Node> {
  for (const candidate of nodes(node)) {
    if (candidate.type === "macro") yield candidate;
  }
}

function environments(root: Node, name: string): readonly Node[] {
  const found: Node[] = [];
  for (const node of nodes(root)) {
    if (node.type !== "environment") continue;
    const env = typeof node.env === "string" ? node.env : flattenAll(node.env ?? []);
    if (env === name) found.push(node);
  }
  return found;
}

function flattenAll(list: readonly Node[]): string {
  return list.map((node) => flatten(node)).join("");
}

/**
 * The end of the last thing the environment holds. The environment's own
 * position runs past it to the closing command, and an entry that reached that
 * far would swallow `\end{thebibliography}` into the last reference.
 */
function lastOffset(node: Node): number {
  let end = node.position?.start.offset ?? 0;
  if (typeof node.content === "string") return end;
  for (const child of node.content ?? []) {
    for (const descendant of nodes(child)) {
      const offset = descendant.position?.end.offset;
      if (offset !== undefined && offset > end) end = offset;
    }
  }
  return end;
}
