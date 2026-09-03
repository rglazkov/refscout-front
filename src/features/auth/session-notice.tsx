"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";

import { isSessionFailure } from "./session";

/**
 * A session that ended in the middle of the work.
 *
 * It happens between two polls of a running job, and what is on the screen at
 * that moment is a check somebody is waiting for. So this is a line above the
 * work with the way back into the account beside it - not a replacement of the
 * screen: the findings that have already arrived stay where they are, stay
 * readable and stay exportable. Signing in again is a reload of the
 * application, which is why it is offered as a choice rather than performed.
 */
export function SessionNotice({ error }: { readonly error: unknown }) {
  const t = useTranslations("account");
  const locale = useLocale() as Locale;

  if (!isSessionFailure(error)) return null;

  return (
    <div
      role="alert"
      data-testid="session-expired"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning-border bg-warning-soft p-3.5 text-sm"
    >
      <p>{t("expired")}</p>
      <Button asChild size="sm" variant="outline">
        <Link href={localizedPath("/account/", locale)}>{t("signIn")}</Link>
      </Button>
    </div>
  );
}
