import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef, JSX } from "react";
import Link from "next/link";

import { Badges, Callout, Card } from "@/components/marketing/content-blocks";
import { cn } from "@/lib/cn";

/**
 * The markup of long texts. The only place that decides how a page looks: the
 * MDX files themselves know nothing about classes or tokens - they hold text
 * only, and the author edits text rather than layout.
 *
 * No element here names the serif. A long text always renders inside a reading
 * region, and the region carries the family; an element that named it too would
 * put the burden of remembering on whoever adds the next one, and the one they
 * forget is the one that comes out in the wrong face. What is named here is the
 * opposite - the two boxes that are not prose: a data table and a block of
 * markup pin the family they need.
 *
 * That includes the measure and the leading, which is why they sit on the
 * elements rather than on the container that renders <Body />. A `[&>p]` rule
 * out there would outrank `leading` here on specificity - so editing this file
 * would change nothing on screen - and it would reach only direct children,
 * leaving a paragraph inside a Card with a different measure from the one
 * above it.
 *
 * MDX compiles to components at build time, so no HTML strings appear here, and
 * internal links go through next/link.
 */
type Props<T extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<T>;

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: ({ className, ...props }: Props<"h1">) => (
      <h1
        className={cn(
          "mt-10 text-3xl font-bold tracking-display text-balance",
          className,
        )}
        {...props}
      />
    ),
    h2: ({ className, ...props }: Props<"h2">) => (
      <h2
        className={cn("mt-10 text-xl font-bold tracking-display", className)}
        {...props}
      />
    ),
    h3: ({ className, ...props }: Props<"h3">) => (
      <h3 className={cn("mt-8 text-lg font-bold", className)} {...props} />
    ),
    p: ({ className, ...props }: Props<"p">) => (
      <p
        className={cn("mt-4 max-w-[66ch] text-lg leading-[1.72] text-pretty", className)}
        {...props}
      />
    ),
    ul: ({ className, ...props }: Props<"ul">) => (
      <ul
        className={cn("mt-4 max-w-[66ch] list-disc space-y-2 ps-5", className)}
        {...props}
      />
    ),
    ol: ({ className, ...props }: Props<"ol">) => (
      <ol
        className={cn("mt-4 max-w-[66ch] list-decimal space-y-2 ps-5", className)}
        {...props}
      />
    ),
    li: ({ className, ...props }: Props<"li">) => (
      <li className={cn("text-lg leading-[1.72]", className)} {...props} />
    ),
    blockquote: ({ className, ...props }: Props<"blockquote">) => (
      <blockquote
        className={cn(
          "mt-6 max-w-[66ch] border-s-2 border-border ps-4 text-lg leading-[1.72] text-muted-foreground",
          className,
        )}
        {...props}
      />
    ),
    hr: ({ className, ...props }: Props<"hr">) => (
      <hr className={cn("mt-10 border-border", className)} {...props} />
    ),
    code: ({ className, ...props }: Props<"code">) => (
      <code
        className={cn(
          "rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.85em]",
          className,
        )}
        {...props}
      />
    ),
    pre: ({ className, ...props }: Props<"pre">) => (
      <pre
        className={cn(
          "mt-6 overflow-x-auto rounded-lg border border-border bg-card p-4 font-mono text-sm",
          className,
        )}
        {...props}
      />
    ),
    table: ({ className, ...props }: Props<"table">) => (
      <div className="mt-6 overflow-x-auto font-sans">
        <table className={cn("w-full border-collapse text-sm", className)} {...props} />
      </div>
    ),
    th: ({ className, ...props }: Props<"th">) => (
      <th
        className={cn("border-b border-border pb-2 text-start font-semibold", className)}
        {...props}
      />
    ),
    td: ({ className, ...props }: Props<"td">) => (
      <td className={cn("border-b border-border py-2 align-top", className)} {...props} />
    ),
    a: ({ href, className, ...props }: Props<"a">) => {
      const target = href ?? "#";
      const classes = cn("text-primary underline-offset-4 hover:underline", className);
      // External links go out as a plain <a> with rel; internal ones use next/link.
      return /^https?:/.test(target) ? (
        <a href={target} rel="noreferrer noopener" className={classes} {...props} />
      ) : (
        <Link href={target} className={classes} {...props} />
      );
    },
    // The blocks a text is allowed to use. The list is deliberately short.
    Card,
    Badges,
    Callout,
    ...components,
  };
}
