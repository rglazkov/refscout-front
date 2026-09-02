import { FileTextIcon, LibraryIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/lib/cn";
import { type BufferItem } from "@/lib/domain";

/**
 * The mark that says what a document is, drawn the same on every screen it
 * appears on: the card in the buffer, the row of the run, the heading on the
 * results.
 *
 * It is here rather than in one of those three because it was in two of them
 * already, written twice and diverging by a size - and because the third
 * screen is what made the divergence visible. What a document looks like is a
 * property of the document, not of the screen it is on.
 */
export function DocumentIcon({
  item,
  size = "md",
}: {
  /** Absent while the results name a document the buffer no longer holds. */
  readonly item: BufferItem | undefined;
  readonly size?: "sm" | "md";
}) {
  const box = size === "sm" ? "size-7" : "size-8";
  const glyph = size === "sm" ? "size-3.5" : "size-4";

  // A document that could not be read says so before it says anything else.
  const unreadable =
    item !== undefined &&
    item.extract.state !== "ready" &&
    item.extract.state !== "partial";

  const icon = unreadable ? (
    <TriangleAlertIcon className={glyph} />
  ) : item?.detected === "bibtex" ? (
    <LibraryIcon className={glyph} />
  ) : item?.origin === "typed" ? (
    <PencilIcon className={glyph} />
  ) : (
    <FileTextIcon className={glyph} />
  );

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-md",
        box,
        unreadable ? "bg-critical-soft text-critical" : "bg-muted text-muted-foreground",
      )}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}
