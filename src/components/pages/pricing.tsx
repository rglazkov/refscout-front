import { getFormatter, getTranslations } from "next-intl/server";

import { UpgradeMount } from "@/components/shell/upgrade-mount";
import { site } from "@/lib/brand";
import { capabilities, planPrice } from "@/lib/entitlements";

/**
 * Pricing is not a long text but a single card, so the page is assembled from
 * components rather than from a file in content/: its strings live in the
 * dictionary like the rest of the interface text.
 *
 * What the plan covers, and which of the checks have no limit for anybody, are
 * read from the one table of rights rather than written out again here. A
 * boundary stated in three places - this page, the lock on a check and the
 * window the lock opens - moves in one of them first, and the disagreement is
 * found by the person paying.
 *
 * The card is served as text, with one live control in it: the button is the
 * end of the offer, so it goes to the payment provider rather than anywhere on
 * this site.
 */
export async function PricingPage() {
  const t = await getTranslations("pricing");
  const item = await getTranslations("pricingPlan");
  const checkName = await getTranslations("capabilities");
  const format = await getFormatter();

  const unlimited = capabilities
    .filter((capability) => capability.tier === "free" && capability.id !== "download")
    .map((capability) => checkName(capability.id));

  return (
    <div
      data-region="reading"
      className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-3xl leading-tight font-bold tracking-display text-balance">
          {t("title")}
        </h1>
        <p className="max-w-[60ch] text-lg text-muted-foreground">
          {t("lead", { brandName: site.name })}
        </p>
      </div>

      <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-3 rounded-xl border border-primary/40 bg-card p-6 font-sans shadow-sm">
        <span className="self-start rounded-sm border border-primary/35 bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">
          {t("badge")}
        </span>

        <div>
          <p className="text-lg font-semibold">{t("planName")}</p>
          <p className="text-3xl leading-none font-bold tracking-tight text-primary">
            {format.number(planPrice.amount, {
              style: "currency",
              currency: planPrice.currency,
              // A whole number of currency units: "$0.00" on a card reads as an
              // invoice, and the pilot's figure has no cents in it to lose.
              maximumFractionDigits: 0,
            })}
          </p>
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("planNote", { free: format.list(unlimited, { type: "conjunction" }) })}
        </p>

        <ul className="ms-4 flex list-disc flex-col gap-1.5 text-sm">
          {capabilities.map(({ id }) => (
            <li key={id} className="ps-1">
              {item(id)}
            </li>
          ))}
        </ul>

        <UpgradeMount />
      </div>

      <p className="mx-auto max-w-[36rem] text-center text-sm text-muted-foreground">
        {t("footnote")}
      </p>
    </div>
  );
}
