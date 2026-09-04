"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import { type BufferItem } from "@/lib/domain";

/**
 * What reading the file in the browser found, on the card of the document it
 * found it in.
 *
 * It is worth being clear about what this is and is not. Nothing here has been
 * anywhere near a server: a duplicate key and an entry nothing cites are
 * visible in the file itself, so they are said now rather than after a check
 * has run and been paid for. Nothing here stops a check either - the text goes
 * as it always would, and the bibliography check on the server still answers
 * the questions that need the outside world.
 *
 * The list is recomputed from the text whenever it settles after an edit, so a
 * line here always describes the document as it now stands.
 */
export function LocalNotes({ item }: { readonly item: BufferItem }) {
  const t = useTranslations("buffer.local");
  if (item.localFindings.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-col gap-1">
      {item.localFindings.map((finding, index) => (
        <li
          key={`${finding.code}-${index}`}
          className={cn(
            "text-xs",
            finding.severity === "warning" ? "text-warning" : "text-muted-foreground",
          )}
        >
          {/* The key of an entry is an identifier, so it is set in the mono
              face wherever it appears - here as in the findings and the
              report. */}
          {t.rich(finding.code, {
            ...finding.params,
            mono: (chunks) => <span className="font-mono">{chunks}</span>,
          })}
        </li>
      ))}
    </ul>
  );
}
