import { zipSync } from "fflate";

export * from "./docx";
export * from "./pdf";

/**
 * The corpus of documents the parsers are run against. Everything in it is
 * written by us: no manuscript of anybody's is in this repository, and the way
 * to keep that true by accident as well as on purpose is to have nowhere to put
 * one. A file somebody sends us is an unpublished work, and its place is not in
 * a git history - which is also why telemetry reports numbers about a bad parse
 * rather than the text that produced it.
 */

/** Markdown with nested lists and fenced code, which is where indentation goes wrong. */
export const NESTED_MARKDOWN = `# Method

1. Prepare the sample
   - rinse twice
   - dry at 40 °C
     - not above 45 °C
2. Measure

\`\`\`python
def measure(sample):
    return sample.mass / sample.volume
\`\`\`

A trailing paragraph with a non-breaking space before 10 kg.
`;

/** A LaTeX manuscript that pulls a chapter in, which is the ordinary thesis shape. */
export const TEX_WITH_INPUT = `\\documentclass[12pt]{article}
\\usepackage{glossaries}
\\newacronym{svm}{SVM}{support vector machine}
\\begin{document}
\\title{On the estimation of variance}
\\input{chapters/introduction}
\\bibliography{refs}
\\end{document}
`;

/** A bibliography with everything that makes hand-written parsers fail. */
export const AWKWARD_BIB = `@string{jmlr = "Journal of Machine Learning Research"}

@article{smith2019,
  author = {Smith, Jane and O'Neill, S{\\'e}an},
  title = {On the estimation of variance},
  journal = jmlr,
  year = {2019},
  note = {Retracted 2021}
}

@article{smith2019,
  author = {Smith, Jane},
  title = {A duplicate key, deliberately},
  year = {2020}
}
`;

/**
 * A bibliography with markup in a field. Nothing in the product ever puts a
 * field into the DOM as markup, and this is the fixture that says so out
 * loud.
 */
export const HOSTILE_BIB = `@misc{evil2024,
  title = {<img src=x onerror="alert(1)"> and a {\\LaTeX} brace},
  author = {Nobody},
  year = {2024}
}
`;

/** A `.txt` saved by an old editor: Cyrillic in windows-1251, and CRLF endings. */
export function cp1251Bytes(): Uint8Array {
  // "Требования к оформлению" - a venue's requirements, as they usually arrive.
  const text = "Требования к оформлению\r\nСписок литературы\r\n";
  const map: Record<string, number> = {};
  // The single-byte range of windows-1251 that carries Cyrillic: U+0410..U+044F
  // sits at 0xC0..0xFF, and U+0401/U+0451 at 0xA8/0xB8.
  for (let code = 0x410; code <= 0x44f; code += 1) {
    map[String.fromCodePoint(code)] = code - 0x410 + 0xc0;
  }
  const out = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    out[index] = map[character] ?? character.charCodeAt(0);
  }
  return out;
}

/**
 * A zip wearing a `.pdf` extension. Intake believes the extension, so this is
 * the fixture that says what happens when it is wrong: a refusal with a way
 * out, and no memory spent on it.
 */
export function zipNamedPdf(): Uint8Array {
  return zipSync({ "payload.txt": new TextEncoder().encode("not a pdf") });
}

/** A file that begins like a PDF and is nothing but noise afterwards. */
export function corruptPdfBytes(): Uint8Array {
  const header = new TextEncoder().encode("%PDF-1.7\n");
  const noise = new Uint8Array(2048);
  for (let index = 0; index < noise.length; index += 1) noise[index] = (index * 37) % 251;
  const out = new Uint8Array(header.length + noise.length);
  out.set(header);
  out.set(noise, header.length);
  return out;
}

/** A name carrying a right-to-left override, which is the oldest disguise there is. */
export const DECEPTIVE_NAME = "invoice\u202Egpj.exe";

/**
 * A LaTeX manuscript carrying its bibliography inside it, which is how a paper
 * written without BibTeX arrives. One entry is cited and one is not, and the
 * label in square brackets is there because it is the thing most easily
 * mistaken for the key.
 */
export const TEX_WITH_BIBLIOGRAPHY = `\\documentclass{article}
\\begin{document}
As shown by \\cite{smith2019}, the variance is stable.
\\begin{thebibliography}{9}
\\bibitem{smith2019} Smith, J. On the estimation of variance. 2019.
\\bibitem[Jo20]{jones2020} Jones, K. An uncited work. 2020.
\\end{thebibliography}
\\end{document}
`;

/** A bibliography that stops in the middle of a field, as a half-saved file does. */
export const BROKEN_BIB = `@article{good,
  title = {A finished entry},
  year = {2019}
}

@article{truncated,
  title = {The file ends here
`;
