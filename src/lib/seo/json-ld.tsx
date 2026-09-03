import { getTranslations } from "next-intl/server";

import { site } from "@/lib/brand";
import { listFeatures } from "@/lib/content/features";
import { planPrice } from "@/lib/entitlements";
import { type Locale } from "@/lib/i18n";

import { localizedPath } from "./metadata";

/**
 * What a crawler is told the product is, in the vocabulary schema.org gives it.
 *
 * The page already carries its title, its description and its address in the
 * metadata; this says the one thing those cannot - that the address is an
 * application, what it does, and what it costs. Two pages describe it: the
 * start, which is the product itself, and the list of checks, which is what it
 * is made of.
 */
type JsonLdValue =
  string | number | readonly string[] | { readonly [key: string]: JsonLdValue };

/**
 * The serialisation, and the reason it is a function of its own.
 *
 * Structured data is written into the page as the text of a script element, and
 * a `<` inside it closes that element early: everything after it is read as
 * markup. The strings here are ours today - the name of the product and the
 * lines of its own content files - but they are text somebody edits, and a
 * document assembled by joining strings is a way to inject a script through
 * one's own data. `JSON.stringify` handles the quoting; escaping `<` as its
 * `<` form closes the one hole it leaves.
 */
export function serializeJsonLd(data: Readonly<Record<string, JsonLdValue>>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The product, as the start page describes it. */
export async function softwareApplicationJsonLd(
  locale: Locale,
): Promise<Record<string, JsonLdValue>> {
  const t = await getTranslations({ locale, namespace: "meta" });
  const features = listFeatures(locale);

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: site.name,
    url: `${site.url}${localizedPath("/", locale)}`,
    description: t("home.description", { brandName: site.name }),
    // The product is a page rather than something installed, and the two
    // properties say so together: a browser is what it runs in, and every
    // system that has one can run it.
    applicationCategory: "EducationalApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    inLanguage: locale,
    // A price is a fact about the offer rather than a sentence on the page, so
    // it comes from the same table the card prints, not from the wording.
    offers: {
      "@type": "Offer",
      price: String(planPrice.amount),
      priceCurrency: planPrice.currency,
    },
    featureList: features.map((feature) => feature.name),
    publisher: { "@type": "Organization", name: site.legalEntity, url: site.url },
  };
}

/**
 * The block itself. React writes the children of a script element out as they
 * are rather than escaping them, which is what makes the escaping above this
 * component's business rather than the framework's.
 *
 * The type is not a JavaScript one, so a browser reads the block as data and
 * never as code: it executes nothing, and the strict policy on script sources
 * has nothing to say about it.
 */
export function JsonLd({
  data,
}: {
  readonly data: Readonly<Record<string, JsonLdValue>>;
}) {
  return <script type="application/ld+json">{serializeJsonLd(data)}</script>;
}
