"use client";

import * as React from "react";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The top of a mode of the working screen.
 *
 * Two of the product's tools do not start from a document in the buffer - one
 * takes a query, the other a pair of versions - so each replaces the contents
 * of the working area rather than living on a page of its own. What that costs
 * the person is knowing where they are and how to get back, which is this: the
 * name of the mode, one line saying what it does, and a button that says
 * "Back" and nothing more clever than that.
 *
 * The words arrive as props. The component is used by two features whose
 * dictionaries are their own, and text in here would be text in a component.
 */
export function ModeHeader({
  title,
  lead,
  back,
  onBack,
  children,
}: {
  readonly title: string;
  readonly lead: string;
  readonly back: string;
  readonly onBack: () => void;
  /** Anything the mode keeps beside its name, such as a state of its own. */
  readonly children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[1.375rem] font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{lead}</p>
      </div>
      <div className="flex items-center gap-2">
        {children}
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeftIcon aria-hidden="true" />
          {back}
        </Button>
      </div>
    </div>
  );
}
