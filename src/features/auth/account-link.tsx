"use client";

import * as React from "react";
import Link from "next/link";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";

import { useSession } from "./use-session";

/**
 * The entry into the account, in the header of every page, saying which of the
 * two errands it is.
 *
 * The header is served as static HTML and cannot know who is reading it, so
 * without this the same control offers to sign in to somebody who is already
 * signed in - on every page, including the account page that is showing their
 * address and a way out at the same time. Which of the two words is right is
 * the server's answer and arrives in a browser, so the live control is this
 * one and the static one underneath is what it replaces.
 *
 * Its words are handed in rather than read here, because the header's own
 * namespace is already in the page: fetching the dictionary again for two
 * labels would download the shell's vocabulary a second time.
 */
export function AccountLink({
  href,
  signedOut,
  signedIn,
  className,
}: {
  readonly href: string;
  /** What the control says to somebody who is not signed in. */
  readonly signedOut: string;
  readonly signedIn: string;
  readonly className?: string;
}) {
  /*
   * A client of this control's own, as everywhere else a single live control
   * sits on an otherwise static page. It costs one `GET /auth/session` beside
   * the one the screen under the header makes: the request is small, the answer
   * is held for a minute, and the alternative - one client shared by the shell
   * and by every screen - is a change to all three screens for a saving of a
   * few hundred bytes.
   */
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AccountButton
        href={href}
        signedOut={signedOut}
        signedIn={signedIn}
        {...(className === undefined ? {} : { className })}
      />
    </QueryClientProvider>
  );
}

function AccountButton({
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
  const { session, pending } = useSession();

  /*
   * While the answer is on its way the control says what the static HTML
   * already said, rather than a third, neutral word: the label under a person's
   * eyes does not change for the one case that is right for them, and it
   * changes once for the other. A refusal is the same case as an anonymous
   * session here - the account page is where somebody goes to fix either.
   */
  const label = !pending && session?.user != null ? signedIn : signedOut;

  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className={className}
      data-testid="account-link"
      data-signed-in={!pending && session?.user != null}
    >
      <Link href={href}>{label}</Link>
    </Button>
  );
}
