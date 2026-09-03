"use client";

import * as React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

import { Button } from "@/components/ui/button";

/**
 * The mount point of the header's account control.
 *
 * The control has to ask the server who is here, which is a thing that happens
 * in a browser, so the live version arrives after the page does. Until it is
 * here the header carries the static link it always carried - the entry into
 * the account is on every page and must never be missing while something loads,
 * because it is also the way in for somebody who came to sign in.
 *
 * The words are passed down from the header, which reads them from the shell's
 * own namespace; nothing here fetches a dictionary.
 */
const AccountLink = dynamic(
  () => import("@/features/auth/account-link").then((module) => module.AccountLink),
  { ssr: false },
);

export function AccountLinkMount({
  href,
  signedOut,
  signedIn,
  className,
}: {
  readonly href: string;
  readonly signedOut: string;
  readonly signedIn: string;
  readonly className?: string;
}) {
  const [ready, setReady] = React.useState(false);

  /*
   * The data source is started before the control is drawn, and it is reached
   * through import() rather than named at the top of the file. A static import
   * of the API layer here would put the client and its schemas into what every
   * page downloads before anything can be read - and this control sits on all
   * of them, the legal pages included.
   */
  React.useEffect(() => {
    let live = true;
    void (async () => {
      const { startApiSource } = await import("@/lib/api");
      await startApiSource();
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, []);

  if (!ready) {
    return (
      <Button asChild variant="outline" size="sm" className={className}>
        <Link href={href} data-testid="account-link">
          {signedOut}
        </Link>
      </Button>
    );
  }

  return (
    <AccountLink
      href={href}
      signedOut={signedOut}
      signedIn={signedIn}
      {...(className === undefined ? {} : { className })}
    />
  );
}
