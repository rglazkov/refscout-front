import type { ReactNode } from "react";

/**
 * The blocks available inside the texts. There are deliberately few of them: a
 * page's text file should stay text rather than become layout. Everything else
 * is ordinary markdown.
 */

/** A captioned card: "What Scout does" with a list underneath. */
export function Card({
  title,
  children,
}: {
  readonly title?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-xl border border-border bg-card px-[1.15rem] py-4">
      {title === undefined ? null : (
        <p className="text-2xs font-semibold tracking-[0.07em] text-muted-foreground uppercase">
          {title}
        </p>
      )}
      <div className="[&>ul]:mt-0">{children}</div>
    </div>
  );
}

/**
 * A row of badges: lists such as "which databases are queried". A row of chips
 * is not prose, so the whole box is set in the interface face - unlike Card and
 * Callout, which hold text and take the serif of the region they stand in,
 * caption included.
 */
export function Badges({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-1.5 font-sans">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-sm border border-border bg-muted px-[0.4375rem] py-0.5 text-xs text-muted-foreground"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/** A call-out: a card with an accent bar down the left. */
export function Callout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col items-start gap-2.5 rounded-lg border border-s-[3px] border-border border-s-primary bg-card px-[1.15rem] py-4 text-lg">
      {children}
    </div>
  );
}
