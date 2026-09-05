"use client";

import * as React from "react";
import { FileTextIcon, LoaderIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import {
  buildPreview,
  type Preview,
  type PreviewNode,
  type PreviewTag,
} from "./preview-tree";

/**
 * The document as a document. A manuscript that came out of Word is markdown by
 * the time it reaches the buffer, and this is the half of that conversion the
 * person actually asked for: they brought a document with headings, lists and
 * tables, and this is where they see one instead of a wall of hashes and pipes.
 *
 * It draws and does nothing else. The page is read-only, and deliberately so: a
 * markdown rendering that could be typed into is a second editor with a second
 * set of defects, while the document itself is one string of text and there is
 * one place to change it. Nothing is measured here either - not an offset, not
 * a line number, not a character count - because the drawing and the source are
 * different strings, and a number taken off the drawing is a number that is
 * wrong by the length of the markup above it.
 */
export function MarkdownPreview({
  text,
  label,
  loadingLabel,
  note,
}: {
  readonly text: string;
  /** Names the page for a screen reader, since it is a region and not a field. */
  readonly label: string;
  readonly loadingLabel: string;
  /** Said under the page where a format was converted to get here. */
  readonly note?: string;
}) {
  const preview = usePreview(text);

  return (
    <div
      role="region"
      aria-label={label}
      aria-busy={preview === null}
      data-testid="preview"
      className="h-full overflow-auto bg-background px-4 pt-6 pb-10"
    >
      {preview === null ? (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" aria-hidden="true" />
          {loadingLabel}
        </p>
      ) : (
        <article className="mx-auto flex max-w-[44rem] flex-col gap-3.5 rounded-lg border bg-card px-8 py-10 font-serif shadow-md sm:px-13">
          <Nodes nodes={preview.nodes} />
          {note === undefined ? null : (
            <p className="flex items-center justify-center gap-2 pt-2 text-center font-sans text-[0.8125rem] text-muted-foreground">
              <FileTextIcon className="size-4 shrink-0" aria-hidden="true" />
              {note}
            </p>
          )}
        </article>
      )}
    </div>
  );
}

/**
 * The tree for one text, and the parser fetched on the way to it.
 *
 * The map of where each block came from travels with the tree and is not read
 * here: this page draws, and marking a paragraph is something to draw only once
 * the findings have places in the text to be marked at.
 */
function usePreview(text: string): Preview | null {
  const [preview, setPreview] = React.useState<Preview | null>(null);

  React.useEffect(() => {
    let current = true;
    void import("./markdown").then(({ tokenize }) => {
      // The overlay may have been closed, or the view switched back, while the
      // parser was on its way.
      if (current) setPreview(buildPreview(tokenize(text), text));
    });
    return () => {
      current = false;
    };
  }, [text]);

  return preview;
}

/**
 * How each element is set. A manuscript is read at length, so the page is
 * serifed throughout and the measure is the same one a printed page uses; the
 * two faces that are not serifed are the two that are not prose - a span of
 * code and the note under the page.
 */
const CLASSES: Readonly<Record<PreviewTag, string>> = {
  p: "text-lg/[1.75]",
  h1: "text-3xl/[1.25] font-bold tracking-tight",
  h2: "mt-2.5 text-[1.375rem] font-bold",
  h3: "mt-1.5 text-lg font-bold",
  h4: "mt-1.5 text-base font-bold",
  h5: "mt-1.5 text-base font-bold",
  h6: "mt-1.5 text-base font-bold",
  ul: "flex list-disc flex-col gap-1 pl-[1.15rem]",
  ol: "flex list-decimal flex-col gap-1 pl-[1.15rem]",
  li: "text-lg/[1.75]",
  blockquote: "border-l-[3px] border-border pl-3.5 text-muted-foreground italic",
  pre: "overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm",
  code: "rounded-sm bg-muted px-1 py-px font-mono text-sm",
  em: "",
  strong: "",
  s: "",
  a: "underline underline-offset-2",
  table: "w-full border-collapse text-base",
  thead: "",
  tbody: "",
  tr: "",
  th: "border border-border px-2 py-1 text-left font-semibold",
  td: "border border-border px-2 py-1",
  hr: "border-border",
  br: "",
};

function Nodes({ nodes }: { readonly nodes: readonly PreviewNode[] }) {
  return nodes.map((node, index) => <Node key={index} node={node} />);
}

function Node({ node }: { readonly node: PreviewNode }): React.ReactNode {
  if (node.kind === "text") return node.text;

  const className = CLASSES[node.tag];

  /*
   * The one element that leaves the page: a new tab, and no handle back to this
   * one. `noopener` is what takes the handle away, and `noreferrer` keeps the
   * address of the page a person is reading their own manuscript on out of
   * somebody else's logs.
   */
  if (node.tag === "a") {
    return (
      <a href={node.href} target="_blank" rel="noopener noreferrer" className={className}>
        <Nodes nodes={node.children} />
      </a>
    );
  }

  // A wide table scrolls inside its own box rather than pushing the page
  // sideways: a manuscript's table of results is often wider than the page it
  // is set on, and a page that scrolls sideways loses the prose as well.
  if (node.tag === "table") {
    return (
      <div className="overflow-x-auto">
        <table className={className}>
          <Nodes nodes={node.children} />
        </table>
      </div>
    );
  }

  if (node.tag === "hr" || node.tag === "br") {
    return React.createElement(node.tag, { className: cn(className) });
  }

  return React.createElement(
    node.tag,
    { className: cn(className) },
    <Nodes nodes={node.children} />,
  );
}
