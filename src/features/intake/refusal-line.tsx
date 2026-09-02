"use client";

import { useTranslations } from "next-intl";

import { type RefusalNotice } from "./use-intake";

/**
 * A refusal names the numbers. "This file is too large" without them leaves the
 * person guessing which of their files it was and by how much.
 *
 * It is one component for both places a refusal appears - the drop zone and the
 * slots on a document's card - because the sentences are the same sentences and
 * a second copy of them would drift.
 */
export function RefusalLine({ notice }: { readonly notice: RefusalNotice }) {
  const t = useTranslations("intake.refusal");
  const slotName = useTranslations("buffer.attach");
  const { refusal, name } = notice;

  switch (refusal.code) {
    case "FILE_TOO_LARGE":
      return (
        <>
          {t("fileTooLarge", {
            name,
            sizeMb: (refusal.size / (1024 * 1024)).toFixed(1),
            limitMb: Math.round(refusal.limit / (1024 * 1024)),
          })}
        </>
      );
    case "TOO_MANY_DOCUMENTS":
      return <>{t("tooMany", { count: refusal.count, limit: refusal.limit })}</>;
    case "DOC_TOO_LARGE":
      return (
        <>{t("docTooLarge", { name, chars: refusal.chars, limit: refusal.limit })}</>
      );
    case "JOB_TOO_LARGE":
      return <>{t("jobTooLarge", { chars: refusal.chars, limit: refusal.limit })}</>;
    // The document and everything hanging off it, taken together: the ceiling
    // is over what one check reads, not over any one of its parts.
    case "CHECK_TOO_LARGE":
      return <>{t("checkTooLarge", { chars: refusal.chars, limit: refusal.limit })}</>;
    case "ATTACHMENT_TOO_LARGE":
      return (
        <>
          {t("attachmentTooLarge", {
            name,
            slot: slotName(`${refusal.slot}.what`),
            chars: refusal.chars,
            limit: refusal.limit,
          })}
        </>
      );
    default:
      return <>{t("unsupported", { name, extension: refusal.extension })}</>;
  }
}
