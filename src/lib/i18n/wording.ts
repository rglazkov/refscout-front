"use client";

import { useTranslations } from "next-intl";

import { type Params } from "@/lib/domain";

/**
 * A phrase the server asked for by key.
 *
 * A module never sends a ready-made sentence: it sends a dictionary key and the
 * substitutions to put in it, so that the same finding reads in whatever
 * language the person is using. That makes the key someone else's data, and a
 * key this release has no wording for is an ordinary thing to receive - the
 * server gains a check, or a code, before the client that draws it is deployed.
 *
 * Looked up blindly, such a key reaches the screen as its own path: a person
 * reads `bibcheck.retracted.title` in the middle of their findings, and the
 * same string is written into the report they take away. The dictionary of
 * refusals already refuses to do that (`messageKeyFor`), and this is the same
 * rule for the phrases: a key that is not in the dictionary is drawn as a
 * sentence saying so, or as whatever the caller has that is better - the code
 * of the finding, the name of the check - and adding a key on the server stays
 * an additive change that does not break a released client.
 */
export function useWording(): (
  key: string,
  params?: Params,
  /** Something more useful than the general sentence: usually the raw code. */
  fallback?: string,
) => string {
  const t = useTranslations();
  return (key, params, fallback) => {
    if (t.has(key)) return t(key, params);
    return fallback ?? t("wording.unknown");
  };
}
