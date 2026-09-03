"use client";

import * as React from "react";
import Link from "next/link";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { ApiError, getEntitlements, messageKeyFor } from "@/lib/api";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

import { useBilling } from "./use-billing";
import { useLeaveSite } from "./leave-site";
import { useSession } from "./use-session";

/**
 * The one control on the pricing card, and the only thing on that page that
 * needs a browser.
 *
 * Signing in and paying are different errands, and the card cannot know which
 * one it is looking at until the server has said who is here. So an anonymous
 * visitor is given the way in - a link to the account, where the providers are
 * - and everyone else is given the payment provider's own page directly, for
 * buying access or for managing what they have already bought.
 *
 * The answer about access is asked for under the same key the working screen
 * uses, so arriving here from a lock costs no second request.
 */
export function UpgradeCta() {
  // One client for this control, made here rather than in the mount: the mount
  // is served with the page, and a query library named there would be
  // downloaded before a card of text could be read.
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <BillingButton />
    </QueryClientProvider>
  );
}

/** The button itself: what it offers depends on who the server says is here. */
function BillingButton() {
  const t = useTranslations("pricing");
  const errors = useTranslations();
  const locale = useLocale() as Locale;
  const { session } = useSession();
  const signedIn = session?.user != null;

  const entitlements = useQuery({
    queryKey: ["entitlements"],
    queryFn: ({ signal }) => getEntitlements({ signal }),
    staleTime: 60_000,
    enabled: signedIn,
  });

  const open = entitlements.data?.access === true;
  const { leave, dialog } = useLeaveSite();
  const billing = useBilling({ leave, open });

  if (!signedIn) {
    return (
      <Button asChild className="mt-1 self-start" data-testid="pricing-sign-in">
        <Link href={localizedPath("/account/", locale)}>{t("connect")}</Link>
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        className="mt-1 self-start"
        data-testid="pricing-billing"
        data-access={open ? "open" : "closed"}
        aria-busy={billing.busy}
        onClick={billing.press}
      >
        {open ? t("manage") : t("connect")}
      </Button>

      {billing.error === undefined ? null : (
        <p role="alert" className="text-sm text-critical" data-testid="pricing-failure">
          {errors(
            messageKeyFor(
              billing.error instanceof ApiError ? billing.error.failure.code : "unknown",
            ),
          )}
        </p>
      )}

      {dialog}
    </>
  );
}
