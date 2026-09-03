"use client";

import * as React from "react";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@/lib/cn";

/**
 * The control the dialogue was opened from, so that closing can hand the focus
 * back to it.
 *
 * Radix hands it to its own `DialogTrigger` instead, and this product has no
 * triggers: a dialogue is opened by a control that is doing something else as
 * well - the document's name, "Remove", a locked check - and the open state
 * lives in a store. With no trigger to return to, Radix cancels the restore and
 * the focus falls to `body`: the person Tabs from the top of the page again,
 * and a screen reader starts reading the site from its header.
 *
 * It is captured while rendering rather than in an effect. Effects run from the
 * inside out, so by the time this component's own effect ran the panel would
 * already have taken the focus, and what was recorded would be the panel.
 */
const OpenerContext = React.createContext<HTMLElement | null>(null);

function Dialog({ open, ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const [opener, setOpener] = React.useState<HTMLElement | null>(null);
  const [wasOpen, setWasOpen] = React.useState(false);

  if (open === true && !wasOpen) {
    setWasOpen(true);
    const active = typeof document === "undefined" ? null : document.activeElement;
    setOpener(active instanceof HTMLElement ? active : null);
  } else if (open !== true && wasOpen) {
    // The element is kept, because closing is when it is needed.
    setWasOpen(false);
  }

  return (
    <OpenerContext.Provider value={opener}>
      <DialogPrimitive.Root data-slot="dialog" open={open} {...props} />
    </OpenerContext.Provider>
  );
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn("dialog-overlay fixed inset-0 z-50 bg-black/50", className)}
      {...props}
    />
  );
}

/**
 * The cross in the corner is drawn only when it has been given a name, and the
 * name is a parameter rather than a word written here.
 *
 * The stock primitive carries a boolean and an English literal beside it, and
 * this folder is exempt from the rule that no text lives in component code -
 * so that literal would have survived into every further language, and the one
 * place it is read is the one place a person cannot see it: a screen reader
 * announcing the only control that closes the window. A label the caller has to
 * supply cannot be forgotten silently, because there is nothing to fall back to.
 */
function DialogContent({
  className,
  children,
  closeLabel,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  readonly closeLabel?: string;
}) {
  const opener = React.useContext(OpenerContext);

  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // `minmax(0, 1fr)` rather than the default `auto`: a grid track sized to
          // its content lets a row of buttons push itself wider than the panel
          // it is in, and the panel has a fixed width, so what overflows is
          // simply outside it.
          "dialog-panel fixed inset-0 z-50 m-auto grid h-fit w-full max-w-[calc(100%-2rem)] grid-cols-[minmax(0,1fr)] gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none sm:max-w-lg",
          className,
        )}
        {...props}
        // Ours runs first and stops Radix's, which would look for a trigger
        // that does not exist and leave the focus on `body`.
        onCloseAutoFocus={(event) => {
          props.onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          opener?.focus();
        }}
      >
        {children}
        {closeLabel === undefined ? null : (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={closeLabel}
            className="absolute end-4 top-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-start", className)}
      {...props}
    />
  );
}

/**
 * The row of answers. It renders what it is given and adds nothing of its own:
 * a dialogue's way out is written by the screen that asked the question, in the
 * words of that question - "Cancel" beside "Remove", "Not yet" beside "Leave" -
 * and a ready-made "Close" appended here would be a second, unnamed exit
 * competing with it. `DialogClose` is what a caller wraps its own button in.
 */
function DialogFooter({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        // Wrapping rather than overflowing: three answers do not fit across a
        // narrow panel, and a button half outside the dialogue is not an answer
        // a person can give.
        "flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-xl leading-none font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
