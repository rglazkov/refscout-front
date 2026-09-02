import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/**
 * The fields: a text input and a text area. A choice of one out of many is not
 * here - it is `components/ui/select`, whose list is drawn in the page so that
 * its rows can answer the pointer.
 *
 * They are ours rather than the CLI's for one reason, and it is the same reason
 * a button has two secondary variants. A field has to be seen against whatever
 * it is standing on, and the two things it stands on are far apart: the panel
 * of a dialogue, which is the page ground, and a card. A field filled with
 * `--background` is the dialogue it sits in, to the byte, and disappears into
 * it. So each variant sits a full step from its own parent, and the variant a
 * field is given says which surface it is on.
 */
const fieldVariants = cva(
  "w-full rounded-md border font-sans text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive",
  {
    variants: {
      surface: {
        ground: "bg-control-ground",
        card: "bg-control-card",
      },
    },
    defaultVariants: { surface: "ground" },
  },
);

/*
 * The file field is a control end to end, so it reacts to the pointer the way
 * every other control does, by colour and never by geometry. A text field does
 * not: there is nothing to open, and a box that lights up under the cursor
 * while typing is noise.
 */
const openerVariants = cva("cursor-pointer", {
  variants: {
    surface: {
      ground: "hover:bg-control-ground-hover",
      card: "hover:bg-control-card-hover",
    },
  },
  defaultVariants: { surface: "ground" },
});

/*
 * A control standing on a field takes the other surface: the field itself is
 * already a control fill, so the only step left is the one back across it.
 * Written out rather than assembled, because a class name built at run time is
 * a class name the stylesheet was never told about.
 */
const fileButtonVariants = cva(
  "p-1.5 file:me-3 file:h-7 file:cursor-pointer file:rounded-md file:border file:px-3 file:font-sans file:text-sm file:font-medium file:text-foreground file:transition-colors",
  {
    variants: {
      surface: {
        ground: "file:bg-control-card hover:file:bg-control-card-hover",
        card: "file:bg-control-ground hover:file:bg-control-ground-hover",
      },
    },
    defaultVariants: { surface: "ground" },
  },
);

export function Input({
  className,
  surface = "ground",
  type,
  ...props
}: React.ComponentProps<"input"> & VariantProps<typeof fieldVariants>) {
  /*
   * The browser draws its own button inside a file field, and it belongs to no
   * theme at all - a grey slab beside controls that were designed. It is
   * dressed as the secondary button it stands next to, and the pointer is on
   * the whole field, because the whole field opens the file dialogue.
   */
  const isFile = type === "file";
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        fieldVariants({ surface }),
        isFile
          ? cn(openerVariants({ surface }), fileButtonVariants({ surface }))
          : "h-9 px-3",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  surface = "ground",
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof fieldVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldVariants({ surface }), "min-h-16 p-3", className)}
      {...props}
    />
  );
}
