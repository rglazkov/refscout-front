import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { shellNamespaces } from "../lib/i18n/messages";
import { locales } from "../lib/i18n/routing";
import { readSources } from "./utils/source-graph";

/**
 * The localisation lint: a key that is missing from the dictionary must not
 * survive as far as the screen, and a language that has fallen a few keys
 * behind must not be published half-translated in silence.
 */
type Dictionary = { readonly [key: string]: string | Dictionary };

function load(locale: string): Dictionary {
  return JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")) as Dictionary;
}

function flatten(dictionary: Dictionary, prefix = ""): string[] {
  return Object.entries(dictionary).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`),
  );
}

/** Keys called statically: t("about.title") under useTranslations("workspace"). */
/**
 * Every way a translator is bound to a namespace, in all three spellings the
 * code uses: `useTranslations("nav")`, `getTranslations("features")` and
 * `getTranslations({ locale, namespace: "meta" })`.
 *
 * The name it is bound to is captured with it, so a key is credited to the
 * namespace it was actually read from rather than to every namespace the file
 * happens to mention. Both directions need that: crediting a key to all of them
 * lets a genuinely missing key pass in one direction, and marks a genuinely
 * unused key as reached in the other.
 */
const BINDING =
  /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:"([^"]*)"|\{[^}]*namespace:\s*"([^"]+)"[^}]*\})?\s*\)/g;

function referencedKeys(): string[] {
  const referenced: string[] = [];
  for (const file of readSources()) {
    if (file.path.startsWith("src/test/")) continue;
    for (const binding of file.text.matchAll(BINDING)) {
      const name = binding[1] ?? "";
      const namespace = binding[2] ?? binding[3] ?? "";
      if (name === "") continue;
      // A key built from a variable is not a literal and is not seen here; the
      // families that happens to are declared in `dynamicKeys` below.
      // `t("key")` and `t.rich("key")` alike: the second is the same lookup
      // with the tags of the phrase filled in by the caller, and a key read
      // that way is a key the dictionary is asked for.
      const calls = file.text.matchAll(
        new RegExp(`\\b${name}(?:\\.rich)?\\(\\s*"([^"$]+)"`, "g"),
      );
      for (const call of calls) {
        const key = call[1] ?? "";
        referenced.push(namespace === "" ? key : `${namespace}.${key}`);
      }
    }
  }
  return [...new Set(referenced)];
}

/**
 * Keys reached through a variable rather than a literal, which the scan above
 * cannot see. Each is a whole family read from a list that lives in the code,
 * so the family is declared here instead of its members.
 */
const dynamicKeys: readonly RegExp[] = [
  // buildMetadata: t(`${id}.title`) over the list of routes.
  /^meta\./,
  // The pricing card: item(id) over its list of lines.
  /^pricingPlan\./,
  // The theme toggle: t(value) over the two positions.
  /^theme\.(light|dark)$/,
  // A page whose title is a navigation item: nav(titleKey).
  /^nav\./,
  // The names of the checks: t(module) over the list of module identifiers,
  // which stay in the code while their names come from here.
  /^capabilities\./,
  // The window a lock opens: the check it is about and the reason the server
  // gave are both values, and each names its own line.
  /^access\.(description|reason)\./,
  // The three sign-in providers, read from the list of them.
  /^account\.provider\./,
  // States read from a value rather than written out: the extraction state of a
  // document, the state of a venue fetch, the state of a job, a severity, a
  // reason a document is not taking part, a settings choice, a syntax.
  /^buffer\.(extract|settings\.(citeSource|keyFormats|sortOrders))\./,
  // The three slots on a document's card are drawn by one control, which reads
  // its words by the name of the slot it was given.
  /^buffer\.attach\.(bibcheck|glossary|venue|bibcheckCites|glossaryUsedBy)\.(label|what|pastedName|pasteTitle)$/,
  /^buffer\.attach\.venue\.state\./,
  /^plan\.(reason|missing)\./,
  /^intake\.paste\.syntax\./,
  /^job\.state\./,
  /^results\.severity\./,
  // The badge on a bibliographic record, named by the database it came from,
  // and the order a list of search results is put in.
  /^sources\./,
  /^scout\.sort\./,
  // A refusal from the server, looked up by its code, and the general refusal
  // an unfamiliar code falls back to.
  /^errors\.(codes\.|unknown$)/,
  /**
   * The phrases the modules ask for by key. The server sends a key and its
   * substitutions rather than a ready-made sentence, so these are reached
   * through `phrase(issue.titleKey)` and never as a literal.
   */
  /^(stage|bibcheck|glossary|presubmit|cite|evidence|action|artifact)\./,
];

/**
 * Text written before the screen that will show it. Being on this list is a
 * line in a diff somebody can ask about; being absent from it and unused is a
 * failure, which is how a control that was specified and never built - or one
 * that was removed and left its words behind - stops being invisible.
 */
const plannedKeys: readonly string[] = [
  // The language switcher in the header. It is not built while there is one
  // language, because a menu with a single row answers nothing; its words wait
  // here, and `unlocalizedPath` waits in lib/seo.
  "language.label",
  "language.more",
];

const dictionaries = new Map(locales.map((locale) => [locale, flatten(load(locale))]));

describe("dictionaries", () => {
  it("every language has the same set of keys", () => {
    const reference = [...(dictionaries.get(locales[0]) ?? [])].sort();
    for (const locale of locales) {
      expect([...(dictionaries.get(locale) ?? [])].sort()).toEqual(reference);
    }
  });

  it("every key called in the code exists in the dictionary", () => {
    const keys = new Set(dictionaries.get(locales[0]) ?? []);
    const missing = referencedKeys().filter((key) => {
      if (keys.has(key)) return false;
      // The key may have been called from another namespace of the same file.
      return ![...keys].some((known) => known.endsWith(`.${key.split(".").pop() ?? ""}`));
    });
    expect(missing).toEqual([]);
  });

  it("every key in the dictionary is reached from the code", () => {
    // The other direction, and the one that catches a control that was
    // specified and never built: its words sit in the dictionary looking
    // finished, and nothing points at their absence from the screen.
    const referenced = new Set(referencedKeys());
    const planned = new Set(plannedKeys);

    const unused = (dictionaries.get(locales[0]) ?? []).filter((key) => {
      if (referenced.has(key) || planned.has(key)) return false;
      return !dynamicKeys.some((pattern) => pattern.test(key));
    });
    expect(unused).toEqual([]);
  });

  it("nothing on the planned list has quietly come into use", () => {
    // Otherwise the list only ever grows, and stops describing anything.
    const referenced = new Set(referencedKeys());
    expect(plannedKeys.filter((key) => referenced.has(key))).toEqual([]);
  });
});

/**
 * The dictionary is split in two, and the split is what keeps the wording of
 * the working screen out of the HTML of every other page. The shell's share
 * travels with each page; the rest arrives with the screen that says it.
 *
 * A namespace read by the shell and left out of that share is a page that
 * renders its own missing-message placeholder, and only in the browser, so the
 * boundary is checked here rather than found there.
 */
/**
 * What is drawn on every address, and therefore what has to be served with the
 * words it reads.
 *
 * The shell and the pages of the site, and one module beside them. "Report a
 * problem" and the switch that stops the automatic reports stand in the footer
 * of every page and open from every state of an error, including one on a page
 * of the site - so unlike the rest of `features/`, that module is not part of
 * the working screen's vocabulary and cannot wait for the working screen's
 * dictionary to be fetched.
 */
const SITE_WIDE = ["src/components/", "src/app/", "src/features/feedback/"] as const;

describe("the shell's share of the dictionary", () => {
  it("holds every namespace the site's own pages read", () => {
    const shell = new Set<string>(shellNamespaces);
    const missing = new Set<string>();

    for (const file of readSources()) {
      // The pages of the site and the shell around them. Everything under
      // `features/` and `stores/` belongs to the working screen, which is
      // handed the whole dictionary; `lib/seo` reads its words on the server at
      // build time and never in a browser; `lib/i18n` looks up the keys the
      // modules name, which is the working screen's own vocabulary.
      const own = SITE_WIDE.some((prefix) => file.path.startsWith(prefix));
      if (!own) continue;
      for (const binding of file.text.matchAll(BINDING)) {
        const namespace = (binding[2] ?? binding[3] ?? "").split(".")[0] ?? "";
        if (namespace !== "" && !shell.has(namespace)) missing.add(namespace);
      }
    }

    expect([...missing]).toEqual([]);
  });

  it("carries nothing the site's own pages do not read", () => {
    // The other direction: a namespace left on the list after the screen that
    // read it moved is the whole point of the split quietly undone.
    const read = new Set<string>();
    for (const file of readSources()) {
      const own = SITE_WIDE.some((prefix) => file.path.startsWith(prefix));
      if (!own) continue;
      for (const binding of file.text.matchAll(BINDING)) {
        const namespace = (binding[2] ?? binding[3] ?? "").split(".")[0] ?? "";
        if (namespace !== "") read.add(namespace);
      }
    }

    expect(shellNamespaces.filter((namespace) => !read.has(namespace))).toEqual([]);
  });
});
