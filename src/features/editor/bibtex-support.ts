"use client";

import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from "@codemirror/autocomplete";
import { foldNodeProp } from "@codemirror/language";
import { type Extension } from "@codemirror/state";
import { styleTags, tags } from "@lezer/highlight";

/**
 * Node folding for BibTeX entries.
 * Folds the body of an entry while leaving the closing brace line visible (VS Code style).
 * This collapses multi-line entries into:
 *   @article{smith2024,...
 *   }
 */
const bibtexFolding = foldNodeProp.add({
  Entry(node, state) {
    const close = node.getChild("EntryClose");
    if (!close) return null;
    const entryLine = state.doc.lineAt(node.from);
    const closeLine = state.doc.lineAt(close.from);
    if (closeLine.number > entryLine.number + 1) {
      return { from: entryLine.to, to: closeLine.from - 1 };
    }
    return null;
  },
  StringEntry(node, state) {
    const close = node.getChild("EntryClose");
    if (!close) return null;
    const entryLine = state.doc.lineAt(node.from);
    const closeLine = state.doc.lineAt(close.from);
    if (closeLine.number > entryLine.number + 1) {
      return { from: entryLine.to, to: closeLine.from - 1 };
    }
    return null;
  },
  PreambleEntry(node, state) {
    const close = node.getChild("EntryClose");
    if (!close) return null;
    const entryLine = state.doc.lineAt(node.from);
    const closeLine = state.doc.lineAt(close.from);
    if (closeLine.number > entryLine.number + 1) {
      return { from: entryLine.to, to: closeLine.from - 1 };
    }
    return null;
  },
});

/**
 * Common entry types with full starter snippets.
 * Literal braces in snippet templates must be escaped as `\{` and `\}`.
 */
const ENTRY_SNIPPETS: readonly Completion[] = [
  snippetCompletion(
    "article\\{#{key},\n  author  = \\{#{author}\\},\n  title   = \\{#{title}\\},\n  journal = \\{#{journal}\\},\n  year    = \\{#{year}\\},\n  volume  = \\{#{volume}\\},\n  number  = \\{#{number}\\},\n  pages   = \\{#{pages}\\},\n  doi     = \\{#{doi}\\}\n\\}",
    { label: "article", detail: "Journal article", type: "class", boost: 10 },
  ),
  snippetCompletion(
    "book\\{#{key},\n  author    = \\{#{author}\\},\n  title     = \\{#{title}\\},\n  publisher = \\{#{publisher}\\},\n  year      = \\{#{year}\\},\n  address   = \\{#{address}\\},\n  isbn      = \\{#{isbn}\\}\n\\}",
    { label: "book", detail: "Whole book", type: "class", boost: 9 },
  ),
  snippetCompletion(
    "inproceedings\\{#{key},\n  author    = \\{#{author}\\},\n  title     = \\{#{title}\\},\n  booktitle = \\{#{booktitle}\\},\n  year      = \\{#{year}\\},\n  pages     = \\{#{pages}\\},\n  doi       = \\{#{doi}\\}\n\\}",
    {
      label: "inproceedings",
      detail: "Conference proceeding paper",
      type: "class",
      boost: 8,
    },
  ),
  snippetCompletion(
    "incollection\\{#{key},\n  author    = \\{#{author}\\},\n  title     = \\{#{title}\\},\n  booktitle = \\{#{booktitle}\\},\n  publisher = \\{#{publisher}\\},\n  year      = \\{#{year}\\},\n  pages     = \\{#{pages}\\}\n\\}",
    {
      label: "incollection",
      detail: "Part of a book with its own title",
      type: "class",
      boost: 7,
    },
  ),
  snippetCompletion(
    "techreport\\{#{key},\n  author      = \\{#{author}\\},\n  title       = \\{#{title}\\},\n  institution = \\{#{institution}\\},\n  year        = \\{#{year}\\},\n  number      = \\{#{number}\\}\n\\}",
    { label: "techreport", detail: "Technical report", type: "class", boost: 6 },
  ),
  snippetCompletion(
    "phdthesis\\{#{key},\n  author = \\{#{author}\\},\n  title  = \\{#{title}\\},\n  school = \\{#{school}\\},\n  year   = \\{#{year}\\}\n\\}",
    { label: "phdthesis", detail: "PhD dissertation", type: "class", boost: 5 },
  ),
  snippetCompletion(
    "mastersthesis\\{#{key},\n  author = \\{#{author}\\},\n  title  = \\{#{title}\\},\n  school = \\{#{school}\\},\n  year   = \\{#{year}\\}\n\\}",
    { label: "mastersthesis", detail: "Master's thesis", type: "class", boost: 4 },
  ),
  snippetCompletion(
    "software\\{#{key},\n  author  = \\{#{author}\\},\n  title   = \\{#{title}\\},\n  year    = \\{#{year}\\},\n  url     = \\{#{url}\\},\n  version = \\{#{version}\\}\n\\}",
    { label: "software", detail: "Software or code repository", type: "class", boost: 4 },
  ),
  snippetCompletion(
    "dataset\\{#{key},\n  author    = \\{#{author}\\},\n  title     = \\{#{title}\\},\n  year      = \\{#{year}\\},\n  publisher = \\{#{publisher}\\},\n  doi       = \\{#{doi}\\}\n\\}",
    { label: "dataset", detail: "Data set or repository", type: "class", boost: 4 },
  ),
  snippetCompletion(
    "misc\\{#{key},\n  author = \\{#{author}\\},\n  title  = \\{#{title}\\},\n  year   = \\{#{year}\\},\n  howpublished = \\{#{howpublished}\\},\n  note   = \\{#{note}\\}\n\\}",
    { label: "misc", detail: "Miscellaneous or web resource", type: "class", boost: 3 },
  ),
  snippetCompletion(
    "online\\{#{key},\n  author = \\{#{author}\\},\n  title  = \\{#{title}\\},\n  year   = \\{#{year}\\},\n  url    = \\{#{url}\\},\n  urldate = \\{#{urldate}\\}\n\\}",
    { label: "online", detail: "Online resource / website", type: "class", boost: 3 },
  ),
  snippetCompletion(
    "unpublished\\{#{key},\n  author = \\{#{author}\\},\n  title  = \\{#{title}\\},\n  note   = \\{#{note}\\},\n  year   = \\{#{year}\\}\n\\}",
    { label: "unpublished", detail: "Unpublished manuscript", type: "class", boost: 2 },
  ),
];

/** Standard fields inside an entry. */
const FIELD_SNIPPETS: readonly Completion[] = [
  snippetCompletion("author = \\{#{author}\\},", {
    label: "author",
    detail: "Authors list",
    type: "property",
    boost: 10,
  }),
  snippetCompletion("title = \\{#{title}\\},", {
    label: "title",
    detail: "Title of work",
    type: "property",
    boost: 10,
  }),
  snippetCompletion("year = \\{#{year}\\},", {
    label: "year",
    detail: "Year of publication",
    type: "property",
    boost: 9,
  }),
  snippetCompletion("journal = \\{#{journal}\\},", {
    label: "journal",
    detail: "Journal name",
    type: "property",
    boost: 9,
  }),
  snippetCompletion("booktitle = \\{#{booktitle}\\},", {
    label: "booktitle",
    detail: "Book / conference title",
    type: "property",
    boost: 8,
  }),
  snippetCompletion("doi = \\{#{doi}\\},", {
    label: "doi",
    detail: "Digital Object Identifier",
    type: "property",
    boost: 8,
  }),
  snippetCompletion("url = \\{#{url}\\},", {
    label: "url",
    detail: "Web link",
    type: "property",
    boost: 7,
  }),
  snippetCompletion("volume = \\{#{volume}\\},", {
    label: "volume",
    detail: "Volume number",
    type: "property",
    boost: 7,
  }),
  snippetCompletion("number = \\{#{number}\\},", {
    label: "number",
    detail: "Issue number",
    type: "property",
    boost: 7,
  }),
  snippetCompletion("pages = \\{#{pages}\\},", {
    label: "pages",
    detail: "Page numbers",
    type: "property",
    boost: 7,
  }),
  snippetCompletion("publisher = \\{#{publisher}\\},", {
    label: "publisher",
    detail: "Publisher name",
    type: "property",
    boost: 7,
  }),
  snippetCompletion("institution = \\{#{institution}\\},", {
    label: "institution",
    detail: "Institution",
    type: "property",
    boost: 6,
  }),
  snippetCompletion("school = \\{#{school}\\},", {
    label: "school",
    detail: "Academic institution",
    type: "property",
    boost: 6,
  }),
  snippetCompletion("editor = \\{#{editor}\\},", {
    label: "editor",
    detail: "Editor(s)",
    type: "property",
    boost: 6,
  }),
  snippetCompletion("address = \\{#{address}\\},", {
    label: "address",
    detail: "Publisher city/location",
    type: "property",
    boost: 5,
  }),
  snippetCompletion("month = \\{#{month}\\},", {
    label: "month",
    detail: "Month of publication",
    type: "property",
    boost: 5,
  }),
  snippetCompletion("note = \\{#{note}\\},", {
    label: "note",
    detail: "Explanatory note",
    type: "property",
    boost: 5,
  }),
  snippetCompletion("abstract = \\{#{abstract}\\},", {
    label: "abstract",
    detail: "Abstract summary",
    type: "property",
    boost: 4,
  }),
  snippetCompletion("isbn = \\{#{isbn}\\},", {
    label: "isbn",
    detail: "ISBN number",
    type: "property",
    boost: 4,
  }),
  snippetCompletion("issn = \\{#{issn}\\},", {
    label: "issn",
    detail: "ISSN number",
    type: "property",
    boost: 4,
  }),
  snippetCompletion("eprint = \\{#{eprint}\\},", {
    label: "eprint",
    detail: "arXiv or eprint ID",
    type: "property",
    boost: 4,
  }),
  snippetCompletion("archivePrefix = \\{arXiv\\},", {
    label: "archivePrefix",
    detail: "Eprint archive prefix",
    type: "property",
    boost: 3,
  }),
  snippetCompletion("primaryClass = \\{#{cs.LG}\\},", {
    label: "primaryClass",
    detail: "arXiv primary classification",
    type: "property",
    boost: 3,
  }),
  snippetCompletion("keywords = \\{#{keywords}\\},", {
    label: "keywords",
    detail: "Keywords",
    type: "property",
    boost: 3,
  }),
];

/**
 * Autocompletion source for BibTeX documents.
 */
export function bibtexCompletion(context: CompletionContext): CompletionResult | null {
  // 1. Entry type completion when typing `@...`
  const atMatch = context.matchBefore(/@\w*/);
  if (atMatch) {
    return {
      from: atMatch.from + 1, // cursor is after `@`
      options: ENTRY_SNIPPETS,
      validFor: /^\w*$/,
    };
  }

  // 2. Field name completion inside entries
  const wordMatch = context.matchBefore(/\b[a-zA-Z]+/);
  if (wordMatch && !context.explicit) {
    // Only suggest fields if we look like we're on an indented or field line
    const line = context.state.doc.lineAt(context.pos);
    const linePrefix = line.text.slice(0, context.pos - line.from);
    // Don't suggest fields right after `@` or within `{value}`
    if (linePrefix.includes("@") && !linePrefix.includes("{")) return null;

    return {
      from: wordMatch.from,
      options: FIELD_SNIPPETS,
      validFor: /^[a-zA-Z]*$/,
    };
  }

  if (context.explicit) {
    return {
      from: context.pos,
      options: [...FIELD_SNIPPETS, ...ENTRY_SNIPPETS],
    };
  }

  return null;
}

/**
 * Creates the BibTeX language extension with custom folding and autocompletion.
 */
export async function loadBibtexExtension(): Promise<Extension> {
  const { bibtexLanguage } = await import("codemirror-lang-bib");
  const configuredLanguage = bibtexLanguage.configure({
    props: [styleTags({ LineComment: tags.lineComment }), bibtexFolding],
  });

  return [
    configuredLanguage,
    bibtexLanguage.data.of({
      autocomplete: bibtexCompletion,
      commentTokens: { line: "%" },
    }),
  ];
}
