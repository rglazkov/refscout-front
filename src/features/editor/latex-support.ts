"use client";

import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  snippetCompletion,
} from "@codemirror/autocomplete";
import { foldService, StreamLanguage } from "@codemirror/language";
import { type Extension } from "@codemirror/state";

/**
 * Section hierarchy levels for folding.
 */
const SECTION_LEVELS: Readonly<Record<string, number>> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

/**
 * Custom folding service for LaTeX.
 * Supports:
 * 1. Environments: `\begin{env}` ... `\end{env}`
 * 2. Document sections: `\section{...}` up to next section of same or higher level
 * 3. Multi-line braces: `{ ... }`
 */
export const latexFoldService = foldService.of((state, lineStart, _lineEnd) => {
  const line = state.doc.lineAt(lineStart);
  const text = line.text;

  // 1. \begin{...} ... \end{...} folding
  const beginMatch = /\\begin\{([a-zA-Z0-9*_-]+)\}/.exec(text);
  if (beginMatch && beginMatch[1]) {
    const envName = beginMatch[1];
    let depth = 0;
    const endPattern = new RegExp(`\\\\end\\{${envName.replace(/[*]/g, "\\*")}\\}`, "g");
    const beginPattern = new RegExp(
      `\\\\begin\\{${envName.replace(/[*]/g, "\\*")}\\}`,
      "g",
    );

    // Scan forward line by line
    for (let lineNo = line.number; lineNo <= state.doc.lines; lineNo++) {
      const currentLine = state.doc.line(lineNo);
      const currentText = currentLine.text;

      // Count begins on this line
      let match: RegExpExecArray | null;
      beginPattern.lastIndex = 0;
      while ((match = beginPattern.exec(currentText)) !== null) {
        if (lineNo > line.number || match.index >= beginMatch.index) {
          depth++;
        }
      }

      // Count ends on this line
      endPattern.lastIndex = 0;
      while ((match = endPattern.exec(currentText)) !== null) {
        depth--;
        if (depth === 0 && lineNo >= line.number) {
          // If the end is on the same line or adjacent line, no multi-line fold needed
          if (lineNo <= line.number + 1) return null;
          // Fold intermediate lines, leaving the closing line visible (VS Code style)
          return { from: line.to, to: currentLine.from - 1 };
        }
      }
    }
  }

  // 2. Section hierarchy folding
  const sectionMatch =
    /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{/.exec(
      text,
    );
  if (sectionMatch && sectionMatch[1]) {
    const sectionType = sectionMatch[1];
    const currentLevel = SECTION_LEVELS[sectionType] ?? 2;

    for (let lineNo = line.number + 1; lineNo <= state.doc.lines; lineNo++) {
      const currentLine = state.doc.line(lineNo);
      const currentText = currentLine.text;

      // Check if we reached the end of document
      if (/\\end\{document\}/.test(currentText)) {
        if (currentLine.from > line.to) {
          return { from: line.to, to: currentLine.from - 1 };
        }
        break;
      }

      // Check for a next section of same or higher hierarchy
      const nextMatch =
        /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{/.exec(
          currentText,
        );
      if (nextMatch && nextMatch[1]) {
        const nextLevel = SECTION_LEVELS[nextMatch[1]] ?? 2;
        if (nextLevel <= currentLevel) {
          return { from: line.to, to: currentLine.from - 1 };
        }
      }
    }

    // Fold until the end of the document if no next section found
    if (state.doc.length > line.to) {
      return { from: line.to, to: state.doc.length };
    }
  }

  // 3. Fallback: multiline open brace `{` without matching `}` on the same line
  const openCount = (text.match(/\{/g) ?? []).length;
  const closeCount = (text.match(/\}/g) ?? []).length;
  if (openCount > closeCount) {
    let depth = openCount - closeCount;
    for (let lineNo = line.number + 1; lineNo <= state.doc.lines; lineNo++) {
      const currentLine = state.doc.line(lineNo);
      for (let i = 0; i < currentLine.text.length; i++) {
        const ch = currentLine.text[i];
        if (ch === "{" && currentLine.text[i - 1] !== "\\") depth++;
        else if (ch === "}" && currentLine.text[i - 1] !== "\\") {
          depth--;
          if (depth === 0) {
            if (lineNo <= line.number + 1) return null;
            return { from: line.to, to: currentLine.from - 1 };
          }
        }
      }
    }
  }

  return null;
});

/**
 * LaTeX environments for `\begin{...}` auto-completion.
 */
const ENVIRONMENT_SNIPPETS: readonly Completion[] = [
  snippetCompletion("equation\\}\n  #{}\n\\end\\{equation\\}", {
    label: "equation",
    detail: "Numbered math equation",
    type: "class",
    boost: 10,
  }),
  snippetCompletion("align\\}\n  #{}\n\\end\\{align\\}", {
    label: "align",
    detail: "Multi-line math alignment",
    type: "class",
    boost: 9,
  }),
  snippetCompletion(
    "figure\\}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]\\{#{image}\\}\n  \\caption\\{#{caption}\\}\n  \\label\\{fig:#{label}\\}\n\\end\\{figure\\}",
    { label: "figure", detail: "Figure float", type: "class", boost: 9 },
  ),
  snippetCompletion(
    "table\\}[htbp]\n  \\centering\n  \\caption\\{#{caption}\\}\n  \\label\\{tab:#{label}\\}\n  \\begin\\{tabular\\}\\{#{cols}\\}\n    #{}\n  \\end\\{tabular\\}\n\\end\\{table\\}",
    { label: "table", detail: "Table float", type: "class", boost: 8 },
  ),
  snippetCompletion("itemize\\}\n  \\item #{}\n\\end\\{itemize\\}", {
    label: "itemize",
    detail: "Bulleted list",
    type: "class",
    boost: 8,
  }),
  snippetCompletion("enumerate\\}\n  \\item #{}\n\\end\\{enumerate\\}", {
    label: "enumerate",
    detail: "Numbered list",
    type: "class",
    boost: 8,
  }),
  snippetCompletion("abstract\\}\n  #{}\n\\end\\{abstract\\}", {
    label: "abstract",
    detail: "Abstract section",
    type: "class",
    boost: 7,
  }),
  snippetCompletion("document\\}\n  #{}\n\\end\\{document\\}", {
    label: "document",
    detail: "Document body",
    type: "class",
    boost: 6,
  }),
  snippetCompletion("proof\\}\n  #{}\n\\end\\{proof\\}", {
    label: "proof",
    detail: "Mathematical proof",
    type: "class",
    boost: 5,
  }),
  snippetCompletion("theorem\\}\n  #{}\n\\end\\{theorem\\}", {
    label: "theorem",
    detail: "Theorem environment",
    type: "class",
    boost: 5,
  }),
  snippetCompletion("lemma\\}\n  #{}\n\\end\\{lemma\\}", {
    label: "lemma",
    detail: "Lemma environment",
    type: "class",
    boost: 5,
  }),
  snippetCompletion("definition\\}\n  #{}\n\\end\\{definition\\}", {
    label: "definition",
    detail: "Definition environment",
    type: "class",
    boost: 5,
  }),
  snippetCompletion("center\\}\n  #{}\n\\end\\{center\\}", {
    label: "center",
    detail: "Centered text block",
    type: "class",
    boost: 4,
  }),
  snippetCompletion("verbatim\\}\n  #{}\n\\end\\{verbatim\\}", {
    label: "verbatim",
    detail: "Preformatted literal block",
    type: "class",
    boost: 4,
  }),
  snippetCompletion("tabular\\}\\{#{cols}\\}\n  #{}\n\\end\\{tabular\\}", {
    label: "tabular",
    detail: "Tabular columns",
    type: "class",
    boost: 4,
  }),
];

/**
 * Standard LaTeX commands for `\...` auto-completion.
 */
const COMMAND_SNIPPETS: readonly Completion[] = [
  snippetCompletion("cite\\{#{key}\\}", {
    label: "cite",
    detail: "Citation: \\cite{key}",
    type: "function",
    boost: 10,
  }),
  snippetCompletion("citep\\{#{key}\\}", {
    label: "citep",
    detail: "Parenthetical citation (natbib)",
    type: "function",
    boost: 9,
  }),
  snippetCompletion("citet\\{#{key}\\}", {
    label: "citet",
    detail: "Textual citation (natbib)",
    type: "function",
    boost: 9,
  }),
  snippetCompletion("ref\\{#{label}\\}", {
    label: "ref",
    detail: "Cross-reference: \\ref{label}",
    type: "function",
    boost: 10,
  }),
  snippetCompletion("label\\{#{label}\\}", {
    label: "label",
    detail: "Reference label: \\label{name}",
    type: "function",
    boost: 9,
  }),
  snippetCompletion("textbf\\{#{text}\\}", {
    label: "textbf",
    detail: "Bold text",
    type: "function",
    boost: 8,
  }),
  snippetCompletion("textit\\{#{text}\\}", {
    label: "textit",
    detail: "Italic text",
    type: "function",
    boost: 8,
  }),
  snippetCompletion("emph\\{#{text}\\}", {
    label: "emph",
    detail: "Emphasized text",
    type: "function",
    boost: 8,
  }),
  snippetCompletion("section\\{#{title}\\}", {
    label: "section",
    detail: "Section heading",
    type: "function",
    boost: 8,
  }),
  snippetCompletion("subsection\\{#{title}\\}", {
    label: "subsection",
    detail: "Subsection heading",
    type: "function",
    boost: 8,
  }),
  snippetCompletion("subsubsection\\{#{title}\\}", {
    label: "subsubsection",
    detail: "Subsubsection heading",
    type: "function",
    boost: 7,
  }),
  snippetCompletion("paragraph\\{#{title}\\}", {
    label: "paragraph",
    detail: "Paragraph heading",
    type: "function",
    boost: 6,
  }),
  snippetCompletion("footnote\\{#{text}\\}", {
    label: "footnote",
    detail: "Footnote",
    type: "function",
    boost: 7,
  }),
  snippetCompletion("url\\{#{url}\\}", {
    label: "url",
    detail: "URL link",
    type: "function",
    boost: 6,
  }),
  snippetCompletion("href\\{#{url}\\}\\{#{text}\\}", {
    label: "href",
    detail: "Hyperlink with label",
    type: "function",
    boost: 6,
  }),
  snippetCompletion("usepackage\\{#{package}\\}", {
    label: "usepackage",
    detail: "Import LaTeX package",
    type: "function",
    boost: 6,
  }),
  snippetCompletion("documentclass\\{#{article}\\}", {
    label: "documentclass",
    detail: "Document class declaration",
    type: "function",
    boost: 5,
  }),
  snippetCompletion("input\\{#{file}\\}", {
    label: "input",
    detail: "Include source file",
    type: "function",
    boost: 5,
  }),
  snippetCompletion("include\\{#{file}\\}", {
    label: "include",
    detail: "Include page break file",
    type: "function",
    boost: 5,
  }),
  snippetCompletion("bibliography\\{#{file}\\}", {
    label: "bibliography",
    detail: "Link bibliography .bib file",
    type: "function",
    boost: 5,
  }),
  snippetCompletion("bibliographystyle\\{#{plain}\\}", {
    label: "bibliographystyle",
    detail: "Set bibliography style",
    type: "function",
    boost: 5,
  }),
  snippetCompletion("item #{text}", {
    label: "item",
    detail: "List item",
    type: "keyword",
    boost: 7,
  }),
  snippetCompletion("begin\\{#{env}\\}", {
    label: "begin",
    detail: "Open environment",
    type: "keyword",
    boost: 7,
  }),
  snippetCompletion("end\\{#{env}\\}", {
    label: "end",
    detail: "Close environment",
    type: "keyword",
    boost: 7,
  }),
];

/**
 * Scans the current document text to find existing citation keys (from \bibitem or @article).
 */
function findDocCitationKeys(docText: string): readonly Completion[] {
  const keys = new Set<string>();

  // 1. Find \bibitem{key}
  const bibitemPattern = /\\bibitem(?:\[[^\]]*\])?\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = bibitemPattern.exec(docText)) !== null) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }

  // 2. Find @entry{key,
  const entryPattern = /@\w+\s*\{\s*([^,\s]+)/g;
  while ((match = entryPattern.exec(docText)) !== null) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }

  return Array.from(keys).map((key) => ({
    label: key,
    detail: "Citation key",
    type: "variable",
    boost: 12,
  }));
}

/**
 * Autocompletion source for LaTeX documents.
 */
export function latexCompletion(context: CompletionContext): CompletionResult | null {
  // 1. Inside `\cite{...}` or `\citep{...}` -> suggest citation keys found in the buffer
  const citeMatch = context.matchBefore(/\\cite[a-zA-Z*]*\{[^}]*$/);
  if (citeMatch) {
    const keyMatch = context.matchBefore(/[a-zA-Z0-9_:.-]*$/);
    const docText = context.state.doc.toString();
    const citationKeys = findDocCitationKeys(docText);
    if (citationKeys.length > 0) {
      return {
        from: keyMatch ? keyMatch.from : context.pos,
        options: citationKeys,
        validFor: /^[a-zA-Z0-9_:.-]*$/,
      };
    }
  }

  // 2. Inside `\begin{...` -> suggest environments
  const beginMatch = context.matchBefore(/\\begin\{[a-zA-Z0-9*_-]*/);
  if (beginMatch) {
    const envPrefix = context.matchBefore(/[a-zA-Z0-9*_-]*$/);
    return {
      from: envPrefix ? envPrefix.from : context.pos,
      options: ENVIRONMENT_SNIPPETS,
      validFor: /^[a-zA-Z0-9*_-]*$/,
    };
  }

  // 3. Typing `\...` -> suggest LaTeX commands
  const slashMatch = context.matchBefore(/\\[a-zA-Z]*/);
  if (slashMatch) {
    return {
      from: slashMatch.from + 1, // cursor is after `\`
      options: COMMAND_SNIPPETS,
      validFor: /^[a-zA-Z]*$/,
    };
  }

  if (context.explicit) {
    return {
      from: context.pos,
      options: COMMAND_SNIPPETS,
    };
  }

  return null;
}

/**
 * Creates the LaTeX language extension with custom folding and autocompletion.
 */
export async function loadLatexExtension(): Promise<Extension> {
  const { stex } = await import("@codemirror/legacy-modes/mode/stex");
  const language = StreamLanguage.define(stex);

  return [
    language,
    latexFoldService,
    language.data.of({
      autocomplete: latexCompletion,
      commentTokens: { line: "%" },
    }),
  ];
}
