"use client";

import { cn } from "@/lib/cn";

/** A height-bearing disclosure: neighbouring content travels with the layout. */
export function Collapse({
  open,
  children,
  className,
  id,
}: {
  readonly open: boolean;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly id?: string;
}) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-[var(--motion-slow)] ease-[var(--ease-out)]",
        open
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
