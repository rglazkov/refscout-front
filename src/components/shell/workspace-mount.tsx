"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { NextIntlClientProvider, useLocale } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";

import { loadMessages } from "@/lib/i18n";

/**
 * The mount point of the workspace screen. A separate client module is needed
 * because ssr: false is not allowed in a server component, and the dynamic
 * loading rule requires exactly that: pdf.js and the workers are pulled in
 * here, and a page somebody merely opened must not carry the weight of them.
 *
 * The words follow the same rule as the code. Most of the dictionary belongs to
 * this screen - the cards, the states of an extraction, the findings, every
 * refusal the server can give - and the provider at the root carries only the
 * shell's share of it, so the pages of the site are not served with a vocabulary
 * they cannot use. The rest is fetched here, in the language being read, and
 * given to a provider of its own; a nested one inherits the time zone and the
 * clock from the one above and replaces only the words.
 */
const Workspace = dynamic(() => import("@/features/buffer/workspace"), {
  ssr: false,
});

export function WorkspaceMount() {
  const locale = useLocale();
  const [messages, setMessages] = React.useState<AbstractIntlMessages | null>(null);

  React.useEffect(() => {
    let live = true;
    void loadMessages(locale).then((loaded) => {
      if (live) setMessages(loaded);
    });
    return () => {
      live = false;
    };
  }, [locale]);

  // Nothing is drawn half-worded. The screen already waits for its data source
  // before it appears, and this arrives alongside that - not after it.
  if (messages === null) return null;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Workspace />
    </NextIntlClientProvider>
  );
}
