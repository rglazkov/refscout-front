"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useLocale } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";

import { startApiSource } from "@/lib/api";
import { loadMessages } from "@/lib/i18n";

/**
 * The mount point of the account screen. Like the working screen it is a client
 * module of its own, because everything it does - asking who is signed in,
 * fetching the address of a payment page, writing an export to a file - happens
 * in a browser and none of it can be rendered ahead of time on a server.
 *
 * Its words arrive the same way too: the account's vocabulary belongs to this
 * screen, not to the shell, so it is fetched in the language being read rather
 * than written into the HTML of every other page.
 */
const AccountScreen = dynamic(
  () => import("@/features/auth/account-screen").then((module) => module.AccountScreen),
  { ssr: false },
);

export function AccountMount() {
  const locale = useLocale();
  const [messages, setMessages] = React.useState<AbstractIntlMessages | null>(null);
  const [ready, setReady] = React.useState(false);
  // One client for this screen. It holds the session and the answer about
  // access, and both are the server's state rather than the browser's.
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
        },
      }),
  );

  React.useEffect(() => {
    let live = true;
    void loadMessages(locale).then((loaded) => {
      if (live) setMessages(loaded);
    });
    return () => {
      live = false;
    };
  }, [locale]);

  // The data source is started before the screen is drawn: a request that left
  // before the mock was intercepting would go to the real address.
  React.useEffect(() => {
    void startApiSource().then(() => setReady(true));
  }, []);

  if (messages === null || !ready) return null;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryClientProvider client={client}>
        <AccountScreen />
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
