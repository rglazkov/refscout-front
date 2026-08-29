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
import { type Locale } from "@/lib/i18n";
import { localizedPath } from "@/lib/seo";
import { useUiStore } from "@/stores";

/** A lock explains the paid check before the person starts filling anything in. */
export function AccessDialog() {
  const t = useTranslations("access");
  const checkName = useTranslations("capabilities");
  const locale = useLocale() as Locale;
  const moduleId = useUiStore((state) => state.paywallModule);
  const close = useUiStore((state) => state.closePaywall);

  if (moduleId === null) return null;
  const description =
    moduleId === "bibcheck"
      ? t("description.bibcheck")
      : moduleId === "glossary"
        ? t("description.glossary")
        : moduleId === "presubmit"
          ? t("description.presubmit")
          : t("description.cite");

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <span className="mb-1 inline-flex w-fit items-center gap-1 rounded-sm border border-primary/35 bg-primary-soft px-2 py-1 text-xs font-semibold text-primary">
            <LockIcon className="size-3" aria-hidden="true" />
            {t("pro")}
          </span>
          <DialogTitle>{t("title", { module: checkName(moduleId) })}</DialogTitle>
          <DialogDescription className="text-base leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

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
          <Button asChild>
            <Link href={localizedPath("/pricing/", locale)} onClick={close}>
              {t("upgrade")}
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
