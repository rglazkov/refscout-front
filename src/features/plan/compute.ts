import {
  type BufferItem,
  type CheckOptions,
  type CheckPlan,
  type Entitlements,
  type ModuleId,
  moduleIds,
} from "@/lib/domain";

/**
 * The plan is a summary, not a second set of switches (M1.6.1). It is assembled
 * from the ticks on the cards: what is ticked on at least one document is what
 * runs. A separate set of switches here would be a second place where the same
 * thing is turned on differently, and a standing question about which of them
 * wins (§7).
 */
export function buildPlan(
  items: readonly BufferItem[],
  options: CheckOptions,
  entitlements: Entitlements | null = null,
): CheckPlan {
  const modules = {} as Record<ModuleId, CheckPlan["modules"][ModuleId]>;

  for (const moduleId of moduleIds) {
    const ticked = items.filter(
      (item) =>
        item.checks.includes(moduleId) &&
        entitlements?.modules[moduleId].allowed !== false,
    );
    const runnable = ticked.filter((item) => hasText(item));
    modules[moduleId] = {
      enabled: runnable.length > 0,
      docIds: runnable.map((item) => item.id),
      // The absence of text is the only reason a check switches off. Every
      // check is available on every document, so there is no other (§4).
      ...(ticked.length > 0 && runnable.length === 0
        ? { blocked: "extract-failed" as const }
        : {}),
    };
  }

  return { modules, options };
}

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
    if (!hasText(item)) return [];
    const checks = item.checks.filter(
      (module) => entitlements?.modules[module].allowed !== false,
    );
    return checks.length === 0 ? [] : [{ ...item, checks }];
  });
}

export function hasText(item: BufferItem): boolean {
  return item.extract.state === "ready" || item.extract.state === "partial";
}

export type Exclusion = {
  readonly docId: string;
  readonly name: string;
  readonly reason: "no-text" | "no-checks";
};

/**
 * The documents that will not take part, each with its reason, right in the
 * summary rather than in a separate list of warnings. One broken document does
 * not block the other four (M1.6.2).
 */
export function exclusionsOf(items: readonly BufferItem[]): readonly Exclusion[] {
  return items.flatMap<Exclusion>((item) => {
    if (!hasText(item)) return [{ docId: item.id, name: item.name, reason: "no-text" }];
    if (item.checks.length === 0) {
      return [{ docId: item.id, name: item.name, reason: "no-checks" }];
    }
    return [];
  });
}

/** Which module runs at all, in the product's own order. */
export function enabledModules(plan: CheckPlan): readonly ModuleId[] {
  return moduleIds.filter((module) => plan.modules[module].enabled);
}
