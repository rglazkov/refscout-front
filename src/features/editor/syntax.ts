"use client";

import * as React from "react";
import { type Extension } from "@codemirror/state";
import { styleTags, tags } from "@lezer/highlight";

import { detectKind } from "@/lib/docs";
import { type DetectedKind, type IntakeDraft, type SourceFormat } from "@/lib/domain";

/**
 * Syntax highlighting for the three formats that carry markup.
 *
 * A hundred BibTeX entries without the fields and the keys picked out are
 * markedly harder to read than the same hundred with them, and reading them is
 * the work: a bibliography brought on its own is a document of the buffer, and
 * the editor is where it is corrected before it is sent. LaTeX and Markdown are
 * the same argument, one register quieter.
 *
 * Text extracted from a PDF gets none of it, and neither does prose typed into
 * the paste box: there is no markup in them to pick out, and highlighting the
 * accidental brace in a sentence is worse than leaving it alone.
 *
 * The modes arrive on demand rather than with the editor. A parser is tens of
 * kilobytes of generated table and it is of no use until a document of that
 * kind is open, so it is fetched when one is - which also keeps it out of the
 * chunk the editor itself lives in, whatever the person happens to open first.
 */
export type SyntaxKind = "bibtex" | "latex" | "markdown" | null;

/**
 * What to highlight this document as. The content decides, not the extension: a
 * `.txt` beginning with `@article{` is a bibliography and reads like one, and
 * that is the same rule the automatic proposal of checks follows.
 */
export function syntaxKindOf(format: SourceFormat, detected: DetectedKind): SyntaxKind {
  if (detected === "bibtex") return "bibtex";
  if (detected === "latex" || format === "tex" || format === "gls") return "latex";
  // `.docx` with them: a Word file lives in the buffer as markdown, and the
  // hashes and table pipes a person reads in it are its markup.
  if (detected === "markdown" || format === "md" || format === "docx") {
    return "markdown";
  }
  return null;
}

async function load(kind: Exclude<SyntaxKind, null>): Promise<Extension> {
  switch (kind) {
    case "bibtex": {
      const { bibtexLanguage } = await import("codemirror-lang-bib");
      /*
       * With one tag the grammar declares and its own highlighting misses. The
       * node is `LineComment`; the package names `Comment`, which no node is
       * called, so a commented-out entry comes out the colour of live text.
       * That matters more here than it looks: commenting entries out is how
       * people keep a bibliography, and one of BibCheck's own settings is
       * whether to count them.
       */
      return bibtexLanguage.configure({
        props: [styleTags({ LineComment: tags.lineComment })],
      });
    }
    case "latex": {
      const [{ StreamLanguage }, { stex }] = await Promise.all([
        import("@codemirror/language"),
        import("@codemirror/legacy-modes/mode/stex"),
      ]);
      return StreamLanguage.define(stex);
    }
    case "markdown": {
      // The language itself rather than `markdown()`. The function carries a
      // whole HTML parser with it - and JavaScript and CSS behind that - for
      // the sake of the markup a Markdown file may embed, which is a hundred
      // kilobytes to colour a `<br>` in somebody's manuscript. The language
      // alone is GFM: headings, emphasis, links, tables and task lists, which
      // is what a document converted from Word is made of.
      const { markdownLanguage } = await import("@codemirror/lang-markdown");
      return markdownLanguage;
    }
  }
}

/**
 * The language extension for one document, or `null` until it has arrived and
 * for the documents that have none. The editor swaps it in through a
 * compartment, so the document, the cursor and the undo history are not
 * disturbed by its arrival.
 */
export function useSyntax(kind: SyntaxKind): Extension | null {
  // Stored with the kind it was fetched for, and read only when the two still
  // agree. Clearing it when the kind changes would be a second write in the
  // same breath, and the answer is already in the pair.
  const [loaded, setLoaded] = React.useState<{
    readonly kind: SyntaxKind;
    readonly extension: Extension;
  } | null>(null);

  React.useEffect(() => {
    if (kind === null) return;
    let current = true;
    void load(kind).then((extension) => {
      // The overlay may have been closed, or another document opened, while the
      // parser was on its way.
      if (current) setLoaded({ kind, extension });
    });
    return () => {
      current = false;
    };
  }, [kind]);

  return loaded !== null && loaded.kind === kind ? loaded.extension : null;
}

/**
 * The same question for text that is being typed rather than for a document
 * that exists. The overlay's switch answers it outright when a person has
 * chosen; on "auto" the text answers for itself, which is what "auto" promises.
 *
 * Only the beginning is read. The signals are all near the top of a document -
 * a `\documentclass`, a first heading, an `@article` - and running a regular
 * expression over a pasted dissertation on every keystroke would be felt.
 */
const SAMPLE = 4096;

export function draftSyntaxKind(text: string, choice: IntakeDraft["syntax"]): SyntaxKind {
  if (choice === "latex") return "latex";
  if (choice === "markdown") return "markdown";
  if (choice === "text") return null;
  return detectedSyntax(text.slice(0, SAMPLE));
}

/**
 * What the text looks like, for the two purposes that need the same answer:
 * what to highlight it as while it is being typed, and what format the element
 * of the buffer gets when "Add to buffer" is pressed. One function, because a
 * draft that highlighted as markdown and then joined the buffer as plain text
 * would be answering the same question twice with different answers.
 */
export function detectedSyntax(text: string): SyntaxKind {
  const kind = detectKind(text, "typed");
  if (kind === "bibtex") return "bibtex";
  if (kind === "latex") return "latex";
  // `detectKind` reads markdown from the extension, which typed text has not
  // got; here the heading is the only evidence there is.
  return /^#{1,6}\s+\S/m.test(text) || /^\s*[-*]\s+\S/m.test(text) ? "markdown" : null;
}
