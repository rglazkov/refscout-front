"use client";

import { useTranslations } from "next-intl";

import { useStorageMode } from "@/lib/storage";

/**
 * What the screen says when the browser is not keeping anything.
 *
 * Three different causes end in one state - a private window with no IndexedDB
 * to give, a quota that ran out in the middle of the work, a browser where the
 * database will not open - and one state deserves one sentence rather than
 * three screens. Nothing is taken away in any of them: the text stays on
 * screen, the check runs, the findings arrive and the file is assembled and
 * downloaded exactly as before. What changes is that none of it survives a
 * reload, and that is said in as many words, because the alternative is
 * somebody finding out afterwards.
 *
 * The other sentence here is for the version that could not carry old documents
 * across a change of schema. Storage works in that case; something was lost
 * anyway, and a loss nobody was told about is the worst kind.
 */
export function StorageNotice() {
  const t = useTranslations("workspace.storage");
  const { durable, fault, discarded } = useStorageMode();

  if (durable && !discarded) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {durable ? null : (
        <div
          role="status"
          data-testid="storage-unavailable"
          data-fault={fault ?? "absent"}
          className="rounded-xl border border-warning-border bg-warning-soft p-3.5 text-sm"
        >
          <p className="font-medium">
            {fault === "quota" ? t("quotaTitle") : t("absentTitle")}
          </p>
          <p className="mt-1">{fault === "quota" ? t("quotaBody") : t("absentBody")}</p>
        </div>
      )}

      {discarded ? (
        <div
          role="status"
          data-testid="storage-discarded"
          className="rounded-xl border border-warning-border bg-warning-soft p-3.5 text-sm"
        >
          <p className="font-medium">{t("discardedTitle")}</p>
          <p className="mt-1">{t("discardedBody")}</p>
        </div>
      ) : null}
    </div>
  );
}
