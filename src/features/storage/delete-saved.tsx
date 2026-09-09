"use client";

import * as React from "react";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { clearStores, readAll } from "@/lib/storage";
import { clearCollected } from "@/lib/telemetry";

/**
 * "Delete saved documents": the answer to "how do I get my manuscript off this
 * computer", and it is one press away from every page.
 *
 * It empties every store holding anything of the person's - the documents, the
 * session, the results and the queue of unsent reports - at once. The cache of
 * the application shell is deliberately not in that list: it holds our own code
 * and not a byte of anybody's, and clearing it would take away the version of
 * the product that works without a network at exactly the moment there may not
 * be one.
 *
 * The question is a dialogue and it names what is about to go and how much of
 * it. Removing a document and clearing everything destroy the same thing - the
 * only copy of a text there is - so they ask in the same way.
 *
 * What follows the deletion is a reload, and that is the point rather than a
 * shortcut. This button stands in the footer of every page, including pages the
 * working screen was never mounted on; emptying the stores from here and then
 * reaching into the buffer, the registry and the places to empty those as well
 * would drag the whole working screen into the footer of the privacy policy. A
 * reload leaves an empty database, and an empty database is an ordinary start.
 */
export function DeleteSavedDocuments() {
  const t = useTranslations("workspace.storage");
  const [asking, setAsking] = React.useState(false);
  const [held, setHeld] = React.useState(0);

  /*
   * How much is actually kept, read from the database rather than from the
   * screen: on most pages the buffer in memory is empty while the browser is
   * still holding a manuscript. The question opens once the number is known, so
   * it never opens saying "nothing" about a browser holding a dissertation.
   */
  const ask = () => {
    void readAll("documents").then((rows) => {
      setHeld(rows.filter((row) => row.key.startsWith("doc:")).length);
      setAsking(true);
    });
  };

  const remove = () => {
    clearCollected();
    void clearStores().then(() => {
      window.location.reload();
    });
  };

  return (
    <>
      <button
        type="button"
        data-testid="delete-saved"
        className="inline-flex cursor-pointer items-center gap-1.5 hover:text-foreground"
        onClick={ask}
      >
        <Trash2Icon aria-hidden="true" className="size-3.5" />
        {t("deleteTitle")}
      </button>

      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={t("deleteTitle")}
        body={t("deleteBody", { count: held })}
        confirmLabel={t("deleteConfirm")}
        cancelLabel={t("deleteCancel")}
        onConfirm={remove}
        testId="delete-saved-dialog"
        extra={<span className="text-xs text-muted-foreground">{t("deleteHint")}</span>}
      />
    </>
  );
}
