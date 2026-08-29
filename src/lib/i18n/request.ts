import type { AbstractIntlMessages } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { defaultLocale, isLocale } from "./routing";

/**
 * next-intl configuration. Called at build time - production has no server.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : defaultLocale;

  const dictionary = (await import(`../../messages/${locale}.json`)) as {
    default: AbstractIntlMessages;
  };

  return {
    locale,
    messages: dictionary.default,
    // The time zone is set explicitly: otherwise a formatted date depends on
    // the machine that ran the build and differs between environments.
    timeZone: "UTC",
  };
});
