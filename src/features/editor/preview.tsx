"use client";

import * as React from "react";
import { LoaderIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { type Severity } from "@/lib/domain";

import { type PanelFinding } from "./findings-model";
import {
  buildPreview,
  type Preview,
  type PreviewNode,
  type PreviewTag,
} from "./preview-tree";
import { EDGE_FADE_MASK, useEdgeFade } from "./use-edge-fade";

/**
 * The face a drawn page is set in.
 *
 * A manuscript is read at length and set in the face it will be printed in, so
 * the page is serifed by default: read that way it is a text rather than the
 * contents of a field. The other position is there for the same reason the
 * source has one - the guess is worth overruling, and somebody proofing on a
 * small screen may simply read a grotesque more easily.
 */
export type PageFace = "serif" | "sans";

/**
 * The document as a document. A manuscript that came out of Word is markdown by
 * the time it reaches the buffer, and this is the half of that conversion the
 * person actually asked for: they brought a document with headings, lists and
 * tables, and this is where they see one instead of a wall of hashes and pipes.
 *
 * It draws, and it is read-only: a markdown rendering that could be typed into
 * is a second editor with a second set of defects, while the document itself is
 * one string of text and there is one place to change it. Nothing is measured
 * off the drawing either, because the drawing and the source are different
 * strings and a number taken off the page is wrong by the length of the markup
 * above it. The one thing it does mark is a paragraph that holds a finding, and
 * the position for that comes from the source through the map the tree was
 * built with - so it is as precise as a block and no more, which is why the
 * press on it goes to the source, where the exact fragment is.
 */
export function MarkdownPreview({
  text,
  label,
  loadingLabel,
  face = "serif",
  findings = NO_FINDINGS,
  onOpenFinding,
}: {
  readonly text: string;
  /** Names the page for a screen reader, since it is a region and not a field. */
  readonly label: string;
  readonly loadingLabel: string;
  /** Which of the two reading faces the page is set in. */
  readonly face?: PageFace;
  /**
   * The findings placed in this document. A paragraph that holds one is marked
   * here, which is as precise as this page can be: the position comes from the
   * token's own map, so it names a block and not a phrase inside it.
   */
  readonly findings?: readonly PanelFinding[];
  readonly onOpenFinding?: (issueKey: string) => void;
}) {
  const preview = usePreview(text);
  const marks = useMarks(preview, findings);
  const page = React.useRef<HTMLElement>(null);
  const fade = useEdgeFade();

  /*
   * A press on a marked paragraph goes to the source at the exact fragment,
   * which is where a correction is made. The listener is attached to the page
   * rather than a control being put on each paragraph: a paragraph is prose and
   * not a button, and the keyboard path to the same findings is the list beside
   * the text, where every one of them is a labelled control.
   */
  React.useEffect(() => {
    const element = page.current;
    if (element === null || onOpenFinding === undefined) return;
    const pressed = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const key = target.closest("[data-finding]")?.getAttribute("data-finding");
      if (key === null || key === undefined) return;
      // Somebody selecting a sentence to copy is not asking to go anywhere.
      if (window.getSelection()?.isCollapsed === false) return;
      onOpenFinding(key);
    };
    element.addEventListener("click", pressed);
    return () => element.removeEventListener("click", pressed);
  }, [onOpenFinding, preview, marks]);

  return (
    <div
      ref={fade}
      role="region"
      aria-label={label}
      aria-busy={preview === null}
      data-testid="preview"
      /* The page stands on the same surface the source does. The field is one
         thing in two views, and a view that took the colour of the panel behind
         it would leave the manuscript separated from the screen by a hairline
         where a moment ago it had stood a clear step off it. */
      style={{ maskImage: EDGE_FADE_MASK }}
      className="h-full overflow-auto bg-card"
    >
      {preview === null ? (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <LoaderIcon className="size-4 animate-spin" aria-hidden="true" />
          {loadingLabel}
        </p>
      ) : (
        <article
          ref={page}
          className={cn(
            "flex flex-col gap-3.5 px-3 py-4 sm:px-6 sm:py-6",
            face === "serif" ? "font-serif" : "font-sans",
          )}
        >
          <Nodes nodes={preview.nodes} marks={marks} />
        </article>
      )}
    </div>
  );
}

const NO_FINDINGS: readonly PanelFinding[] = [];

/** Which block each finding falls in, and what it is called there. */
type BlockMark = { readonly issueKey: string; readonly severity: Severity };

function useMarks(
  preview: Preview | null,
  findings: readonly PanelFinding[],
): ReadonlyMap<number, BlockMark> {
  return React.useMemo(() => {
    const marks = new Map<number, BlockMark>();
    if (preview === null) return marks;
    for (const finding of findings) {
      for (const placed of finding.places) {
        const range = placed.place.range;
        if (range === undefined) continue;
        // The innermost block that contains it: a list item rather than the
        // list around it, which is the smallest true thing this map can say.
        for (let at = preview.blocks.length - 1; at >= 0; at -= 1) {
          const block = preview.blocks[at];
          if (block === undefined) continue;
          if (range.from < block.from || range.from >= block.to) continue;
          if (!marks.has(at)) {
            marks.set(at, { issueKey: finding.issueKey, severity: finding.severity });
          }
          break;
        }
      }
    }
    return marks;
  }, [preview, findings]);
}

/**
 * The tree for one text, and the parser fetched on the way to it.
 *
 * The map of where each block came from travels with the tree, and it is what
 * puts a finding on a paragraph: the offsets in it are the source's, so the
 * mark lands where the module was looking rather than where the markup happened
 * to end up on the page.
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
 * How each element is set. The page takes one face throughout, and it is set
 * across the whole of the field rather than on a sheet drawn inside it: the
 * field is already a bounded region with a border of its own, and a second
 * frame inside the first takes width from the text without adding anything -
 * most of all on a phone, where the two paddings and the two borders together
 * are a third of the screen. The one face named here is the one thing on the
 * page that is not prose, a span of code, which stays monospaced in both.
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

/**
 * How a marked block is drawn: a bar down its edge in the colour of the
 * severity, and a pointer over it. Colour and a border it always has room for,
 * never a change of size - a paragraph that grew when a finding landed on it
 * would move the line the person was reading.
 */
const MARK_CLASSES: Readonly<Record<Severity, string>> = {
  critical: "border-s-critical bg-critical-soft",
  warning: "border-s-warning bg-warning-soft",
  info: "border-s-muted-foreground bg-muted",
};

function Nodes({
  nodes,
  marks,
}: {
  readonly nodes: readonly PreviewNode[];
  readonly marks: ReadonlyMap<number, BlockMark>;
}) {
  return nodes.map((node, index) => <Node key={index} node={node} marks={marks} />);
}

function Node({
  node,
  marks,
}: {
  readonly node: PreviewNode;
  readonly marks: ReadonlyMap<number, BlockMark>;
}): React.ReactNode {
  if (node.kind === "text") return node.text;

  const mark = node.block === undefined ? undefined : marks.get(node.block);
  const className = cn(
    CLASSES[node.tag],
    mark !== undefined &&
      cn(
        "cursor-pointer rounded-e-sm border-s-[3px] ps-2.5",
        MARK_CLASSES[mark.severity],
      ),
  );
  const marked = mark === undefined ? {} : { "data-finding": mark.issueKey };

  /*
   * The one element that leaves the page: a new tab, and no handle back to this
   * one. `noopener` is what takes the handle away, and `noreferrer` keeps the
   * address of the page a person is reading their own manuscript on out of
   * somebody else's logs.
   */
  if (node.tag === "a") {
    return (
      <a href={node.href} target="_blank" rel="noopener noreferrer" className={className}>
        <Nodes nodes={node.children} marks={marks} />
      </a>
    );
  }

  // A wide table scrolls inside its own box rather than pushing the page
  // sideways: a manuscript's table of results is often wider than the page it
  // is set on, and a page that scrolls sideways loses the prose as well.
  if (node.tag === "table") {
    return (
      <div className="overflow-x-auto">
        <table className={className} {...marked}>
          <Nodes nodes={node.children} marks={marks} />
        </table>
      </div>
    );
  }

  if (node.tag === "hr" || node.tag === "br") {
    return React.createElement(node.tag, { className });
  }

  return React.createElement(
    node.tag,
    { className, ...marked },
    <Nodes nodes={node.children} marks={marks} />,
  );
}
