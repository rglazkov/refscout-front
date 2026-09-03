"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";

import { Button } from "@/components/ui/button";
import { defaultLocale, isLocale, loadMessages } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

/**
 * The mount point of the pricing card's button.
 *
 * Everything the live control does - asking who is signed in, asking whether
 * paid access is open, fetching the address of the payment provider's page -
 * happens in a browser, so it is a client module of its own and the words the
 * dialogue it can raise needs are fetched with it.
 *
 * Unlike the working screen and the account, this one is not allowed to be
 * absent while that arrives. The button is the only action on the page an
 * offer is made on, and a person sent here by a lock must find something to
 * press. So the page is served with a link to the account - the way in, and
 * the place the payment button also lives - and the live control replaces it
 * once it is ready.
 */
const UpgradeCta = dynamic(
  () => import("@/features/auth/upgrade-cta").then((module) => module.UpgradeCta),
  { ssr: false },
);

export function UpgradeMount() {
  const t = useTranslations("pricing");
  const active = useLocale();
  const locale = isLocale(active) ? active : defaultLocale;
  const [messages, setMessages] = React.useState<AbstractIntlMessages | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void loadMessages(locale).then((loaded) => {
      if (live) setMessages(loaded);
    });
    return () => {
      live = false;
    };
  }, [locale]);

  /*
   * The data source is started before the control is drawn: a request that left
   * before the mock was intercepting would go to the real address.
   *
   * It is reached through import() rather than named at the top of the file,
   * and that is what keeps this page a marketing page. A static import of the
   * API layer would put the client, its schemas and everything they reach into
   * what the browser downloads before the card can be read - on an address
   * whose whole content is text.
   */
  React.useEffect(() => {
    void (async () => {
      const { startApiSource } = await import("@/lib/api");
      await startApiSource();
      setReady(true);
    })();
  }, []);

  if (messages === null || !ready) {
    return (
      <Button asChild className="mt-1 self-start">
        <Link href={localizedPath("/account/", locale)}>{t("connect")}</Link>
      </Button>
    );
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <UpgradeCta />
    </NextIntlClientProvider>
  );
}
