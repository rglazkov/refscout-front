"use client";

import Link from "next/link";
import { CheckIcon, LockIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { lockActionFor } from "@/lib/entitlements";
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";
import { useEntitlementsStore, useUiStore } from "@/stores";

/**
 * A lock explains the paid check before the person starts filling anything in.
 *
 * What it offers depends on why the check is locked. Signing in and buying
 * access are different errands, and the four reasons the server can give are
 * two of each: an anonymous visitor is offered the way in, and everyone whose
 * trial is spent or whose period has ended is offered the way to renew it. A
 * refusal that names no reason still gets a sentence and a way forward - an
 * empty window reads as a broken interface, and a person who cannot tell what
 * happened cannot resolve it either.
 */
export function AccessDialog() {
  const t = useTranslations("access");
  const checkName = useTranslations("capabilities");
  const locale = useLocale() as Locale;
  const moduleId = useUiStore((state) => state.paywallModule);
  const close = useUiStore((state) => state.closePaywall);
  const entitlements = useEntitlementsStore((state) => state.entitlements);

  if (moduleId === null) return null;
  const reason = entitlements?.modules[moduleId].lockReason;
  const action = lockActionFor(reason);
  const target = action === "sign-in" ? "/account/" : "/pricing/";

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <span className="mb-1 inline-flex w-fit items-center gap-1 rounded-sm border border-primary/35 bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">
            <LockIcon className="size-3" aria-hidden="true" />
            {t("pro")}
          </span>
          <DialogTitle>{t("title", { module: checkName(moduleId) })}</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            {t(`description.${moduleId}`)}
          </DialogDescription>
        </DialogHeader>

        {/* Why this check is locked for this person, in its own words. The four
            cases are different situations with different ways out, and one
            sentence covering all of them would be true of none of them. */}
        <p className="text-sm font-medium" data-testid="lock-reason" data-reason={reason}>
          {t(`reason.${reason ?? "unknown"}`)}
        </p>

        <ul className="space-y-2 text-sm">
          {[t("benefit.before"), t("benefit.visible"), t("benefit.export")].map(
            (benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <CheckIcon
                  className="mt-0.5 size-4 shrink-0 text-ok"
                  aria-hidden="true"
                />
                <span>{benefit}</span>
              </li>
            ),
          )}
        </ul>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("notNow")}
            </Button>
          </DialogClose>
          <Button asChild data-testid="lock-action" data-action={action}>
            <Link href={localizedPath(target, locale)} onClick={close}>
              {action === "sign-in" ? t("signIn") : t("upgrade")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
