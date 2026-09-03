"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { site } from "@/lib/brand";
import { mainItems, useBufferStore } from "@/stores";

/**
 * The question asked before the browser leaves this site.
 *
 * Signing in and paying both go to somebody else's domain and come back as a
 * fresh load of the application, and until documents survive a reload that
 * means the buffer does not come back with them. The extracted text is the only
 * copy of the document in existence - there is no file on our servers and, for
 * a paste, none on disk either - so the loss is named before it happens rather
 * than discovered on the way back.
 *
 * It is a dialogue because it is a question with two answers, and the honest
 * second answer is "not yet, let me save my work first". When storage that
 * survives a reload arrives, this goes away together with the loss it warns
 * about.
 */
export function useLeaveSite(): {
  readonly leave: (go: () => void) => void;
  readonly dialog: React.ReactNode;
} {
  const t = useTranslations("account");
  // The selector hands back the store's own array and the derivation happens
  // afterwards: a selector that builds a new array on every call gives a new
  // snapshot on every render, and the subscription never settles.
  const items = useBufferStore((state) => state.items);
  const documents = React.useMemo(() => mainItems(items), [items]);
  const [pending, setPending] = React.useState<{ readonly go: () => void } | null>(null);

  const leave = React.useCallback(
    (go: () => void) => {
      if (documents.length === 0) go();
      else setPending({ go });
    },
    [documents.length],
  );

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      title={t("leaving.title", { brandName: site.name })}
      body={t("leaving.body", { documents: documents.length })}
      confirmLabel={t("leaving.confirm")}
      cancelLabel={t("leaving.cancel")}
      onConfirm={() => pending?.go()}
      testId="leaving-site"
    />
  );

  return { leave, dialog };
}
