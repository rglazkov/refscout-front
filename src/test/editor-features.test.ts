import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext } from "@codemirror/autocomplete";
import { foldable } from "@codemirror/language";

import { bibtexCompletion, loadBibtexExtension } from "../features/editor/bibtex-support";
import {
  latexCompletion,
  latexFoldService,
  loadLatexExtension,
} from "../features/editor/latex-support";

describe("LaTeX code folding", () => {
  it("folds \\begin{env} ... \\end{env} blocks", () => {
    const doc = [
      "\\documentclass{article}",
      "\\begin{document}",
      "\\begin{equation}",
      "  E = mc^2",
      "\\end{equation}",
      "\\end{document}",
    ].join("\n");

    const state = EditorState.create({
      doc,
      extensions: [latexFoldService],
    });

    // Line 3 is `\begin{equation}`
    const eqLine = state.doc.line(3);
    const fold = foldable(state, eqLine.from, eqLine.to);

    expect(fold).not.toBeNull();
    // Should fold from end of `\begin{equation}` line to end of line before `\end{equation}`
    expect(fold?.from).toBe(eqLine.to);
    expect(fold?.to).toBe(state.doc.line(5).from - 1);
  });

  it("handles nested environments correctly", () => {
    const doc = [
      "\\begin{figure}",
      "  \\centering",
      "  \\begin{tabular}{cc}",
      "    1 & 2 \\\\",
      "  \\end{tabular}",
      "\\end{figure}",
    ].join("\n");

    const state = EditorState.create({
      doc,
      extensions: [latexFoldService],
    });

    // Outer figure folds until before \end{figure}
    const figLine = state.doc.line(1);
    const figFold = foldable(state, figLine.from, figLine.to);
    expect(figFold).not.toBeNull();
    expect(figFold?.to).toBe(state.doc.line(6).from - 1);

    // Inner tabular folds until before \end{tabular}
    const tabLine = state.doc.line(3);
    const tabFold = foldable(state, tabLine.from, tabLine.to);
    expect(tabFold).not.toBeNull();
    expect(tabFold?.to).toBe(state.doc.line(5).from - 1);
  });

  it("folds sections up to next section of equal or higher hierarchy", () => {
    const doc = [
      "\\section{First Section}",
      "Introductory text.",
      "\\subsection{Subsection}",
      "Subsection details.",
      "\\section{Second Section}",
      "Next section text.",
    ].join("\n");

    const state = EditorState.create({
      doc,
      extensions: [latexFoldService],
    });

    // Section 1 should fold until before Section 2
    const sec1Line = state.doc.line(1);
    const sec1Fold = foldable(state, sec1Line.from, sec1Line.to);
    expect(sec1Fold).not.toBeNull();
    expect(sec1Fold?.to).toBe(state.doc.line(5).from - 1);

    // Subsection should fold until before Section 2 as well
    const subLine = state.doc.line(3);
    const subFold = foldable(state, subLine.from, subLine.to);
    expect(subFold).not.toBeNull();
    expect(subFold?.to).toBe(state.doc.line(5).from - 1);
  });
});

describe("LaTeX autocompletion", () => {
  it("suggests commands when typing a backslash", () => {
    const doc = "\\ci";
    const state = EditorState.create({ doc });
    const context = new CompletionContext(state, 3, false);

    const result = latexCompletion(context);
    expect(result).not.toBeNull();
    expect(result?.options.some((opt) => opt.label === "cite")).toBe(true);
    expect(result?.options.some((opt) => opt.label === "textbf")).toBe(true);
  });

  it("suggests environments when typing \\begin{", () => {
    const doc = "\\begin{eq";
    const state = EditorState.create({ doc });
    const context = new CompletionContext(state, 9, false);

    const result = latexCompletion(context);
    expect(result).not.toBeNull();
    expect(result?.options.some((opt) => opt.label === "equation")).toBe(true);
    expect(result?.options.some((opt) => opt.label === "figure")).toBe(true);
  });

  it("suggests citation keys when inside \\cite{", () => {
    const doc = [
      "\\begin{document}",
      "As shown in \\cite{",
      "\\end{document}",
      "\\bibitem{vaswani2017attention}",
      "\\bibitem{devlin2018bert}",
    ].join("\n");

    const citePos = doc.indexOf("\\cite{") + "\\cite{".length;
    const state = EditorState.create({ doc });
    const context = new CompletionContext(state, citePos, false);

    const result = latexCompletion(context);
    expect(result).not.toBeNull();
    expect(result?.options.some((opt) => opt.label === "vaswani2017attention")).toBe(
      true,
    );
    expect(result?.options.some((opt) => opt.label === "devlin2018bert")).toBe(true);
  });
});

describe("BibTeX folding and autocompletion", () => {
  it("folds multi-line BibTeX entries", async () => {
    const doc = [
      "@article{smith2024,",
      "  author = {Smith, John},",
      "  title = {A Title},",
      "  year = {2024}",
      "}",
    ].join("\n");

    const bibtexExt = await loadBibtexExtension();
    const state = EditorState.create({
      doc,
      extensions: [bibtexExt],
    });

    const entryLine = state.doc.line(1);
    const fold = foldable(state, entryLine.from, entryLine.to);
    expect(fold).not.toBeNull();
    // Folds from end of entry header line to end of line before closing brace
    expect(fold?.from).toBe(entryLine.to);
    expect(fold?.to).toBe(state.doc.line(5).from - 1);
  });

  it("suggests entry types when typing @", () => {
    const doc = "@art";
    const state = EditorState.create({ doc });
    const context = new CompletionContext(state, 4, false);

    const result = bibtexCompletion(context);
    expect(result).not.toBeNull();
    expect(result?.options.some((opt) => opt.label === "article")).toBe(true);
    expect(result?.options.some((opt) => opt.label === "book")).toBe(true);
    expect(result?.options.some((opt) => opt.label === "inproceedings")).toBe(true);
  });

  it("suggests fields when typing field names inside an entry", () => {
    const doc = "@article{key,\n  aut";
    const state = EditorState.create({ doc });
    const context = new CompletionContext(state, doc.length, false);

    const result = bibtexCompletion(context);
    expect(result).not.toBeNull();
    expect(result?.options.some((opt) => opt.label === "author")).toBe(true);
    expect(result?.options.some((opt) => opt.label === "journal")).toBe(true);
  });

  it("loads language extensions without throwing", async () => {
    await expect(loadBibtexExtension()).resolves.toBeDefined();
    await expect(loadLatexExtension()).resolves.toBeDefined();
  });
});
