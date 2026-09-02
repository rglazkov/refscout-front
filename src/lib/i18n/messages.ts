import type { AbstractIntlMessages } from "next-intl";

import { defaultLocale, isLocale } from "./routing";

/**
 * Which words travel in the HTML of every page, and which arrive with the
 * screen that says them.
 *
 * The dictionary is one file and it grows with the product: the findings, the
 * cards of the buffer, the states of an extraction, the sentence under every
 * refusal the server can give. Handed whole to the provider at the root, all of
 * it is written into the HTML of every address - so the page of the privacy
 * policy carries the wording of a document card, a password prompt and a
 * retracted-article finding, none of which it can draw.
 *
 * So it is split where the product is split. The site's own pages read the
 * shell's words and are served with them; everything the working screen reads
 * arrives in the chunk the working screen arrives in, for the one language
 * being shown.
 */
export const shellNamespaces = [
  "error",
  "features",
  "footer",
  "nav",
  "page",
  "pricing",
  "pricingPlan",
  "stub",
  "theme",
  "workspace",
] as const;

/**
 * The namespaces above, taken out of the whole. A name that is not in the
 * dictionary is simply absent rather than an empty object: an empty namespace
 * would answer a lookup with a missing-message error instead of falling through
 * to the one the working screen provides.
 */
export function shellMessages(all: AbstractIntlMessages): AbstractIntlMessages {
  const shell: Record<string, AbstractIntlMessages[string]> = {};
  for (const namespace of shellNamespaces) {
    const messages = all[namespace];
    if (messages !== undefined) shell[namespace] = messages;
  }
  return shell;
}

/**
 * The whole dictionary of one language, fetched in the browser.
 *
 * It is an `import()` with the language in the path, so the bundler makes one
 * chunk per language and a person is sent the one they are reading in. The
 * working screen waits for it the way it already waits for its data source,
 * which is the same beat: nothing of the screen is drawn half-worded.
 */
export async function loadMessages(locale: string): Promise<AbstractIntlMessages> {
  const language = isLocale(locale) ? locale : defaultLocale;
  const dictionary = (await import(`../../messages/${language}.json`)) as {
    default: AbstractIntlMessages;
  };
  return dictionary.default;
}
