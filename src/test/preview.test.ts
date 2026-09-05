import { describe, expect, it } from "vitest";

import { tokenize } from "@/features/editor/markdown";
import {
  buildPreview,
  previewTags,
  type Preview,
  type PreviewNode,
} from "@/features/editor/preview-tree";

import { NESTED_MARKDOWN } from "./corpus";

/**
 * The preview of a markdown document, as data.
 *
 * Two claims are being held here, and neither is visible on screen. The first
 * is that a document is drawn without ever becoming a string of markup: what
 * the parser produces is turned into elements from a fixed list, so a `<script>`
 * somebody typed into their manuscript is a run of characters and has no path
 * to being anything else. The second is that every position the drawing knows
 * about is a position in the source, because the two are different strings of
 * different lengths and a number taken off the drawing is wrong by the length
 * of the markup above it.
 */
function preview(text: string): Preview {
  return buildPreview(tokenize(text), text);
}

/** The words of a node and everything under it, with no markup in between. */
function plain(node: PreviewNode): string {
  if (node.kind === "text") return node.text;
  return node.children.map(plain).join("");
}

function plainOf(nodes: readonly PreviewNode[]): string {
  return nodes.map(plain).join("");
}

/** Every element in the tree, in the order they were built. */
function elements(
  nodes: readonly PreviewNode[],
): ReadonlyArray<Extract<PreviewNode, { kind: "element" }>> {
  return nodes.flatMap((node) =>
    node.kind === "text" ? [] : [node, ...elements(node.children)],
  );
}

/**
 * A slice of the text by the offsets a block carries. Code points, because that
 * is the unit the offsets are counted in and the unit every other measurement
 * in this product agrees on - slicing the string directly would be right up to
 * the first formula or emoji and wrong after it.
 */
function slice(text: string, from: number, to: number): string {
  return [...text].slice(from, to).join("");
}

describe("a markdown document becomes a tree of elements", () => {
  const DOCUMENT = [
    "# Method",
    "",
    "Prose with bold and a table below it.",
    "",
    "- first item",
    "- second item",
    "",
    "| Sample | Mass |",
    "| --- | --- |",
    "| A | 12 g |",
    "",
    "> A quotation.",
    "",
  ].join("\n");

  it("draws the constructs a manuscript is made of", () => {
    const tags = elements(preview(DOCUMENT).nodes).map((node) => node.tag);
    // The heading, the paragraph, the list with its items, the table down to a
    // cell, and the quotation.
    expect(tags).toContain("h1");
    expect(tags).toContain("p");
    expect(tags).toContain("ul");
    expect(tags).toContain("li");
    expect(tags).toContain("table");
    expect(tags).toContain("th");
    expect(tags).toContain("td");
    expect(tags).toContain("blockquote");
  });

  it("uses no tag that is not on the list of tags it may use", () => {
    /*
     * The list is the whole of the guarantee. A tag that came from the document
     * rather than from the list would be an element chosen by somebody else's
     * text, which is the shape every markup injection has.
     */
    const allowed = new Set<string>(previewTags);
    const used = new Set(elements(preview(NESTED_MARKDOWN).nodes).map((n) => n.tag));
    expect([...used].filter((tag) => !allowed.has(tag))).toEqual([]);
  });

  it("a tight list has no paragraph inside its items", () => {
    // The paragraph markers of a tight list are hidden ones: drawn, they would
    // put a paragraph's spacing between every pair of bullets.
    const list = elements(preview("- one\n- two\n").nodes).find((n) => n.tag === "ul");
    expect(list).toBeDefined();
    expect(elements(list?.children ?? []).map((n) => n.tag)).toEqual(["li", "li"]);
  });

  it("a fenced block keeps its lines as they were written", () => {
    const code = elements(preview(NESTED_MARKDOWN).nodes).find((n) => n.tag === "pre");
    expect(code).toBeDefined();
    expect(plain(code as PreviewNode)).toContain("def measure(sample):");
    // The indentation inside the fence is part of the code, not of the markup.
    expect(plain(code as PreviewNode)).toContain("    return sample.mass");
  });
});

describe("what somebody else wrote stays what they wrote", () => {
  const HOSTILE = [
    "A paragraph before it.",
    "",
    '<script>alert("xss")</script>',
    "",
    'An inline <b onmouseover="alert(1)">tag</b> in a sentence.',
    "",
    '<img src="x" onerror="alert(1)">',
    "",
  ].join("\n");

  it("HTML written into a document is drawn as its characters", () => {
    const tree = preview(HOSTILE);
    const words = plainOf(tree.nodes);

    // Every one of them is still readable, character for character.
    expect(words).toContain('<script>alert("xss")</script>');
    expect(words).toContain('<b onmouseover="alert(1)">tag</b>');
    expect(words).toContain('<img src="x" onerror="alert(1)">');

    // And none of them became an element. What is in the tree is paragraphs.
    const tags = new Set(elements(tree.nodes).map((node) => node.tag));
    expect([...tags]).toEqual(["p"]);
  });

  it("a link is drawn only when the browser could be sent to it", () => {
    const tree = preview(
      [
        "[an ordinary link](https://example.org/paper)",
        "",
        "[a script](javascript:alert(1))",
        "",
        "[a file](file:///etc/passwd)",
        "",
        "[a relative path](/somewhere/else)",
        "",
      ].join("\n"),
    );

    const links = elements(tree.nodes).filter((node) => node.tag === "a");
    expect(links.map((link) => link.href)).toEqual(["https://example.org/paper"]);

    /*
     * The refused ones keep their words. They are the author's text, and losing
     * a phrase out of somebody's manuscript is a worse answer than showing it
     * without the link under it.
     */
    const words = plainOf(tree.nodes);
    for (const phrase of ["a script", "a file", "a relative path"]) {
      expect(words).toContain(phrase);
    }
  });

  it("a picture becomes the description its author gave it", () => {
    // There is no picture to draw - the entries they lived in were left unread
    // inside the Word container - and an address here would be this browser
    // fetching something on behalf of a document somebody else wrote.
    const tree = preview("![a plot of the residuals](figures/plot.png)\n");
    expect(plainOf(tree.nodes)).toContain("a plot of the residuals");
    expect(elements(tree.nodes).map((node) => node.tag)).toEqual(["p"]);
  });
});

describe("the map of where each block came from", () => {
  it("every block names lines that hold the words it was built from", () => {
    const tree = preview(NESTED_MARKDOWN);
    expect(tree.blocks.length).toBeGreaterThan(0);

    let checked = 0;
    for (const node of elements(tree.nodes)) {
      if (node.block === undefined) continue;
      /*
       * The innermost blocks alone - a paragraph, a heading, a cell. A list or
       * a quotation holds other blocks, and its words run together only because
       * the lines between them are markup that the drawing does not carry.
       */
      if (elements(node.children).some((child) => child.block !== undefined)) continue;

      const block = tree.blocks[node.block];
      expect(block).toBeDefined();
      if (block === undefined) continue;

      /*
       * Asked line by line rather than as one string, because what separates
       * the lines in the source - a list marker, the hashes of a heading, the
       * indentation of a nested item - is markup, and markup is exactly what
       * the drawing does not have.
       */
      const source = slice(NESTED_MARKDOWN, block.from, block.to);
      for (const line of plain(node).split("\n")) {
        if (line.trim() === "") continue;
        expect(source).toContain(line.trim());
      }
      checked += 1;
    }
    // The walk found blocks to check rather than skipping every one of them.
    expect(checked).toBeGreaterThan(3);
  });

  it("the offsets are the lines the block covers, counted in code points", () => {
    const text = "# Заголовок\n\nПервый абзац.\n\nВторой абзац.\n";
    const tree = preview(text);

    // Written out rather than derived, so that a change to how offsets are
    // counted fails here instead of agreeing with itself.
    const heading = tree.blocks[0];
    expect(heading).toEqual({ fromLine: 0, toLine: 1, from: 0, to: 12 });
    expect(slice(text, heading?.from ?? 0, heading?.to ?? 0)).toBe("# Заголовок\n");

    const first = tree.blocks[1];
    expect(slice(text, first?.from ?? 0, first?.to ?? 0)).toBe("Первый абзац.\n");
  });

  it("the last block of a document reaches its end", () => {
    // The map ends on the line after the block, and for the last block of a
    // document that is a line which does not exist.
    const text = "One paragraph.\n\nAnd a last one with no newline after it.";
    const tree = preview(text);
    const last = tree.blocks.at(-1);
    expect(last).toBeDefined();
    expect(slice(text, last?.from ?? 0, last?.to ?? 0)).toBe(
      "And a last one with no newline after it.",
    );
  });

  it("a heading and the paragraph under it do not claim the same lines", () => {
    const text = "# A heading\n\nA paragraph.\n";
    const [heading, paragraph] = preview(text).blocks;
    expect(heading?.to).toBeLessThanOrEqual(paragraph?.from ?? 0);
  });
});
