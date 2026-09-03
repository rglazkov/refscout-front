"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";

import { openBillingPortal, startCheckout } from "@/lib/api";
import { PRO_PLAN } from "@/lib/entitlements";

/**
 * Buying access and managing what has already been bought, written once.
 *
 * Two screens press this button - the account and the card on the pricing page
 * - and they must not disagree about which of the two errands the press is. The
 * question separating them is a single field of the server's answer, and
 * working it out in two places would mean a person who has already paid being
 * sent to buy the same thing again from whichever of the two screens was
 * written second.
 *
 * Neither address is ours. Both calls answer with the payment provider's own
 * page and the browser is sent there, so this application has no field for a
 * card number and never sees one.
 */
export type Billing = {
  readonly press: () => void;
  readonly busy: boolean;
  /** The refusal, if one came back, and `undefined` while none has. */
  readonly error: unknown;
};

export function useBilling({
  leave,
  open,
}: {
  /**
   * The question asked before the browser leaves the site. It is passed in
   * rather than raised here, because a screen owns one such dialogue and a
   * second instance would draw a second copy of it over the first.
   */
  readonly leave: (go: () => void) => void;
  /** Whether paid access is open right now - the server's answer, unmodified. */
  readonly open: boolean;
}): Billing {
  const checkout = useMutation({
    mutationFn: () => startCheckout(PRO_PLAN),
    onSuccess: (url) => leave(() => window.location.assign(url)),
  });

  const portal = useMutation({
    mutationFn: () => openBillingPortal(),
    onSuccess: (url) => leave(() => window.location.assign(url)),
  });

  const press = React.useCallback(() => {
    if (open) portal.mutate();
    else checkout.mutate();
  }, [open, portal, checkout]);

  return {
    press,
    busy: checkout.isPending || portal.isPending,
    // Normalised to one absent value: a caller that falls back to this with ??
    // would otherwise be handed the null react-query reports for "no error yet"
    // and read it as a refusal.
    error: checkout.error ?? portal.error ?? undefined,
  };
}
