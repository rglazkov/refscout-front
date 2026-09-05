import MarkdownIt from "markdown-it";

import { type MarkdownToken } from "./preview-tree";

/**
 * The tokens a preview is drawn from.
 *
 * This module is reached through `import()` alone, and that is what keeps
 * markdown-it out of the chunk the editor arrives in. Most documents in this
 * product are a PDF, a `.tex` or a bibliography; none of them has a preview,
 * and none of their readers should carry a markdown parser they will never run.
 *
 * The parser is built once and kept. It holds nothing between documents - a
 * parse takes a string and gives back a list - and building it again for every
 * document opened would be tens of rules registered afresh for no difference.
 */
let parser: InstanceType<typeof MarkdownIt> | null = null;

function markdown(): InstanceType<typeof MarkdownIt> {
  parser ??= new MarkdownIt({
    /*
     * Raw HTML in the source stays the characters it is. With this off the
     * rules for HTML blocks and inline HTML never run, so a `<script>` written
     * into somebody's manuscript leaves the parser as an ordinary text token
     * and is drawn as the text it was. There is no branch anywhere that could
     * turn it into a tag, which is also why no sanitiser is needed: there is
     * nothing for one to sanitise.
     */
    html: false,
    /*
     * A bare address stays a bare address. Turning one into a link is a guess
     * about what the author meant, made over a document we did not write; the
     * links this preview draws are the ones the author wrote as links.
     */
    linkify: false,
    /*
     * Quotes, dashes and ellipses are left exactly as typed. The person reading
     * this preview is checking their own manuscript, and a typographer that
     * quietly replaces their quotation marks would show them a document that
     * differs from the one they are about to send.
     */
    typographer: false,
  });
  return parser;
}

/** The block and inline tokens of one markdown document, in document order. */
export function tokenize(text: string): readonly MarkdownToken[] {
  return markdown().parse(text, {});
}
