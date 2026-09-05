import { lineStarts } from "@/lib/docs";
import { asDocOffset, type DocOffset } from "@/lib/domain";

/**
 * A markdown document turned into a tree of elements to draw, and a map saying
 * which part of the source each block came from.
 *
 * The whole of it is data. Nothing here builds a string of HTML, and there is
 * no branch that could: a tag is one of the names in `previewTags` and nowhere
 * else, an address is checked before it becomes one, and every other piece of
 * the document arrives as text. What a person brought in their manuscript can
 * therefore be drawn without being trusted, because the only thing it is ever
 * allowed to become is the words it says.
 *
 * The map is the other half, and it is the half the rest of the product needs.
 * A drawn document and its source are different strings of different lengths -
 * the hashes of a heading, the markers of a list and the syntax of a table take
 * up room in the text and show up nowhere on the page - so a position read off
 * the drawing would part company with the text at the first heading and drift
 * further apart down the document. Every address therefore lives in the source:
 * a block token carries the lines it was built from, and those lines are turned
 * into offsets here, once, while the tree is being built.
 */

/**
 * The shape this module reads a markdown-it token through. It is written out
 * rather than imported so that the tree can be built and tested without the
 * parser, and so that this file names exactly the fields it depends on.
 */
export type MarkdownToken = {
  readonly type: string;
  readonly tag: string;
  /** Name and value, in pairs. A value may be a number - a table's alignment is. */
  readonly attrs: readonly (readonly (string | number)[])[] | null;
  /** The lines of the source this block covers: first, and one past the last. */
  readonly map: readonly [number, number] | null;
  readonly nesting: number;
  readonly children: readonly MarkdownToken[] | null;
  readonly content: string;
  /** True for the paragraph markers a tight list hides. */
  readonly hidden: boolean;
};

/**
 * Every element a preview may contain. A tag that is not on this list cannot be
 * drawn, whatever a document asks for, and the list is short because a
 * manuscript is prose: headings, paragraphs, lists, quotations, code, tables
 * and the marks that change how a word is set.
 */
export const previewTags = [
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "code",
  "em",
  "strong",
  "s",
  "a",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "hr",
  "br",
] as const;

export type PreviewTag = (typeof previewTags)[number];

export type PreviewNode =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "element";
      readonly tag: PreviewTag;
      /** Set on `a` alone, and only when the address passed the scheme check. */
      readonly href?: string;
      /** Where this element came from: an index into `Preview.blocks`. */
      readonly block?: number;
      readonly children: readonly PreviewNode[];
    };

/**
 * Where one block of the drawing sits in the text it was built from. The lines
 * are the token's own; the offsets are those lines counted in the units a
 * string is made of, which is what every map beside the text is counted in and
 * what a resolved place is compared against.
 *
 * A block, not a phrase. The token map is per block, so a place found this way
 * marks a paragraph and not a range inside it - and that is the accuracy this
 * map claims. The exact range lives in the source, where what is shown and what
 * is stored agree character for character.
 */
export type PreviewBlock = {
  readonly fromLine: number;
  readonly toLine: number;
  readonly from: DocOffset;
  readonly to: DocOffset;
};

export type Preview = {
  readonly nodes: readonly PreviewNode[];
  readonly blocks: readonly PreviewBlock[];
};

/**
 * The tag each block-opening token becomes. A token type absent from here opens
 * nothing: its contents are drawn into whatever contains it, which is what
 * should happen to a construct this preview has no element for.
 */
const BLOCK_TAGS: Readonly<Record<string, PreviewTag>> = {
  paragraph_open: "p",
  bullet_list_open: "ul",
  ordered_list_open: "ol",
  list_item_open: "li",
  blockquote_open: "blockquote",
  table_open: "table",
  thead_open: "thead",
  tbody_open: "tbody",
  tr_open: "tr",
  th_open: "th",
  td_open: "td",
};

/** The same for the marks that wrap a run of words rather than a block. */
const INLINE_TAGS: Readonly<Record<string, PreviewTag>> = {
  strong_open: "strong",
  em_open: "em",
  s_open: "s",
};

const HEADINGS: Readonly<Record<string, PreviewTag>> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h5",
  h6: "h6",
};

/**
 * Which addresses may be drawn as links, and it is the rule the addresses from
 * the API are held to as well: `http` and `https`, and no other scheme at all.
 * A scheme other than those, in something a browser is sent to, is not followed
 * but executed - and the document this address came out of is somebody else's.
 * An address that fails leaves the words it was written on as ordinary text:
 * they are the author's, and dropping them would be a worse answer than not
 * offering the link.
 */
const NAVIGABLE = /^https?:\/\//i;

function attribute(token: MarkdownToken, name: string): string | undefined {
  for (const pair of token.attrs ?? []) {
    if (pair[0] === name && typeof pair[1] === "string") return pair[1];
  }
  return undefined;
}

/** A frame of the walk: an element being filled, or a wrapper that draws nothing. */
type Frame = {
  readonly tag: PreviewTag | null;
  readonly href?: string;
  readonly block?: number;
  readonly children: PreviewNode[];
};

export function buildPreview(tokens: readonly MarkdownToken[], text: string): Preview {
  const starts = lineStarts(text);
  const total = text.length;
  const blocks: PreviewBlock[] = [];
  const root: PreviewNode[] = [];
  const stack: Frame[] = [];

  const top = (): PreviewNode[] => stack.at(-1)?.children ?? root;

  const add = (node: PreviewNode): void => {
    top().push(node);
  };

  const addText = (value: string): void => {
    if (value !== "") add({ kind: "text", text: value });
  };

  /** Records where a token came from, and gives back its place in the map. */
  const recordPlace = (token: MarkdownToken): number | undefined => {
    if (token.map === null) return undefined;
    const [fromLine, toLine] = token.map;
    blocks.push({
      fromLine,
      toLine,
      from: asDocOffset(starts[fromLine] ?? total),
      // The map ends on the line after the block, which for the last block of a
      // document is a line that does not exist.
      to: asDocOffset(toLine < starts.length ? (starts[toLine] ?? total) : total),
    });
    return blocks.length - 1;
  };

  const open = (tag: PreviewTag | null, token: MarkdownToken): void => {
    const block = recordPlace(token);
    stack.push({ tag, ...(block === undefined ? {} : { block }), children: [] });
  };

  const close = (): void => {
    const frame = stack.pop();
    if (frame === undefined) return;
    // A frame with no tag of its own - the paragraph a tight list hides, or a
    // construct this preview has no element for - hands its contents to
    // whatever contains it rather than leaving with them.
    if (frame.tag === null) {
      for (const child of frame.children) add(child);
      return;
    }
    add({
      kind: "element",
      tag: frame.tag,
      ...(frame.href === undefined ? {} : { href: frame.href }),
      ...(frame.block === undefined ? {} : { block: frame.block }),
      children: frame.children,
    });
  };

  /** A leaf element: written out whole rather than opened and then filled. */
  const leaf = (
    tag: PreviewTag,
    children: readonly PreviewNode[],
    token?: MarkdownToken,
  ): void => {
    const block = token === undefined ? undefined : recordPlace(token);
    add({ kind: "element", tag, ...(block === undefined ? {} : { block }), children });
  };

  const walkInline = (children: readonly MarkdownToken[]): void => {
    for (const token of children) {
      switch (token.type) {
        case "text":
          addText(token.content);
          break;
        // A line broken inside a paragraph. On a drawn page it is a space
        // between the words, which is how it reads in the source.
        case "softbreak":
          addText("\n");
          break;
        case "hardbreak":
          leaf("br", []);
          break;
        case "code_inline":
          leaf("code", [{ kind: "text", text: token.content }]);
          break;
        case "strong_open":
        case "em_open":
        case "s_open":
          open(INLINE_TAGS[token.type] ?? null, token);
          break;
        case "strong_close":
        case "em_close":
        case "s_close":
        case "link_close":
          close();
          break;
        case "link_open": {
          const href = attribute(token, "href");
          const allowed = href !== undefined && NAVIGABLE.test(href);
          stack.push({
            tag: allowed ? "a" : null,
            ...(allowed && href !== undefined ? { href } : {}),
            children: [],
          });
          break;
        }
        /*
         * The description the author gave the picture, and nothing else. The
         * entries the pictures lived in were left unread inside the Word
         * container, so there is no image here to draw - and an address to go
         * and fetch one from would be this browser making a request on behalf
         * of a document somebody else wrote.
         */
        case "image":
          addText(token.content);
          break;
        default:
          break;
      }
    }
  };

  for (const token of tokens) {
    if (token.type === "inline") {
      walkInline(token.children ?? []);
      continue;
    }

    if (token.type === "heading_open") {
      open(HEADINGS[token.tag] ?? "p", token);
      continue;
    }

    if (token.type === "fence" || token.type === "code_block") {
      leaf(
        "pre",
        [
          {
            kind: "element",
            tag: "code",
            children: [{ kind: "text", text: token.content }],
          },
        ],
        token,
      );
      continue;
    }

    if (token.type === "hr") {
      leaf("hr", [], token);
      continue;
    }

    const blockTag = BLOCK_TAGS[token.type];
    if (blockTag !== undefined) {
      // A hidden marker is the paragraph inside a tight list item: it exists so
      // that the tokens nest, and drawing it would put a paragraph's spacing
      // between every pair of bullets.
      open(token.hidden ? null : blockTag, token);
      continue;
    }

    /*
     * Everything else closes what it opened, and a construct this preview has
     * no element for closes nothing. `html_block` is in that second group and
     * is the one worth naming: with raw HTML switched off the parser never
     * produces one, and were it ever to, nothing here would draw it.
     */
    if (token.nesting === -1) close();
  }

  // A document that ends inside an element nothing closed. A parser does not
  // produce one, and a tree left half-built would be worse than a page drawn
  // short.
  while (stack.length > 0) close();

  return { nodes: root, blocks };
}
