import { withCompanions } from "@/lib/docs";
import { type BufferItem, type Entitlements } from "@/lib/domain";

/**
 * What a document's card says about the run it is about to take part in. Every
 * answer here is per document, because that is the question a person asks -
 * what will happen to this file - and because a buffer holding three
 * manuscripts is an ordinary buffer.
 *
 * None of it is a second set of switches: everything reported is turned on
 * somewhere on the same card, and one thing turned on in two places is a
 * standing question about which of the two wins.
 */

/**
 * The exact documents handed to submission. A stale lock in the interface is
 * not protection (the server remains authoritative), but a lock we already
 * know about must not be sent as though the plan had promised it would run.
 */
export function runnableItems(
  items: readonly BufferItem[],
  entitlements: Entitlements | null,
): readonly BufferItem[] {
  return items.flatMap((item) => {
    if (item.attachedTo !== undefined || !hasText(item)) return [];
    const checks = item.checks.filter(
      (module) => entitlements?.modules[module].allowed !== false,
    );
    return checks.length === 0 ? [] : [{ ...item, checks }];
  });
}

/**
 * Exactly what leaves, companions included. Both places that print a number -
 * the buffer's heading and the line under the button - read it from here, so
 * "will be sent: 3 documents" and "text will be sent: 2 documents" cannot say
 * different things on the same screen.
 */
export function sendingItems(
  items: readonly BufferItem[],
  entitlements: Entitlements | null,
): readonly BufferItem[] {
  return withCompanions(runnableItems(items, entitlements), items);
}

/**
 * Whether there is anything here to check. Three states qualify, and the third
 * is deliberate: a document whose text came out badly still has text, the
 * person has been told to look at it, and refusing to run it would take the
 * decision away from them.
 */
export function hasText(item: BufferItem): boolean {
  const { state } = item.extract;
  return state === "ready" || state === "partial" || state === "suspicious";
}

/**
 * The two checks that read a second text. BibCheck reads the bibliography the
 * manuscript cites; Glossary reads a glossary file that already exists. Both
 * are brought in on the card, and both are optional: without them the check
 * still runs and does less.
 */
export type CompanionModule = "bibcheck" | "glossary";

export function wantsCompanion(module: string): module is CompanionModule {
  return module === "bibcheck" || module === "glossary";
}

/**
 * The checks ticked on this document that have no text to read alongside it,
 * and which are therefore about to do less than they can. Named on the card
 * before the run for the same reason a missing venue is: the answer arrives
 * without the missing half, and finding that out from the results is finding it
 * out too late.
 */
export function incompleteOf(
  item: BufferItem,
  all: readonly BufferItem[],
): readonly CompanionModule[] {
  if (!hasText(item)) return [];
  return item.checks.filter(wantsCompanion).filter((module) => {
    const companionId = item.companions[module];
    if (companionId === undefined) return true;
    const companion = all.find((candidate) => candidate.id === companionId);
    return companion === undefined || !hasText(companion);
  });
}

/**
 * Why this document will take no part in the run, or `null` when it will. It is
 * answered per document and shown on that document's own card: one broken file
 * does not block the other four, and the person is told which one it was
 * without having to match a name against a list at the bottom of the page.
 */
export function reasonNotRunning(item: BufferItem): "no-text" | "no-checks" | null {
  if (!hasText(item)) return "no-text";
  if (item.checks.length === 0) return "no-checks";
  return null;
}
