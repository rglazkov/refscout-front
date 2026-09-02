"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The question asked before something is destroyed.
 *
 * It is a dialogue rather than a panel that unfolds under the control. What is
 * about to go is the only copy of the text there is, and a strip appearing at
 * the end of a card is answerable by scrolling past it: the page stays usable,
 * the question stays optional, and on a long buffer the strip can open below
 * the fold of a card the person is not even looking at. A modal stops the page,
 * puts the two answers side by side, takes the focus and gives it back - and
 * Esc is one of the answers.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  extra,
  testId,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  /** An action offered beside the two answers - downloading before clearing. */
  readonly extra?: React.ReactNode;
  readonly testId?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Wide enough to hold the two answers and whatever is offered beside
          them on one line. At `md` the three wrapped, and the offer ended up
          alone above a row of answers pushed to the far corner. */}
      <DialogContent showCloseButton={false} data-testid={testId} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end">
          {/* Not an answer to the question, so it does not stand in the row of
              answers: it is pushed to the far end, and when the panel is too
              narrow to hold everything it is this that wraps away. */}
          {extra === undefined ? null : (
            <div className="w-full sm:me-auto sm:w-auto">{extra}</div>
          )}
          {/* The two answers are one item of the row, so they wrap together and
              are never left on separate lines: they are read against each
              other, and a question whose answers are not side by side has to be
              re-read before it can be answered. */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {/* Cancel is the safe answer, so it is the ordinary button and the
                one Esc reaches; the destructive answer carries the colour that
                says what it does. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {cancelLabel}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              data-testid="confirm-destructive"
              onClick={() => {
                onOpenChange(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
