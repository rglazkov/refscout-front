import { type LockReason, type ModuleId, moduleIds } from "@/lib/domain";

/**
 * One table of rights, and the only one.
 *
 * Three places in the product state where the paid boundary runs: the pricing
 * page, the lock on a check, and the window the lock opens. Written out three
 * times they agree until the first change of plan, and the disagreement is
 * found by whoever is paying. So the boundary is declared once here, and each
 * of the three renders from it.
 *
 * What is not here: any number describing how much access is left. Days of
 * access are spent by the server, and the client asks `GET /entitlements`
 * whether access is open rather than working it out - a table of prices cannot
 * answer that and must not look as though it could.
 */
export type Tier = "free" | "paid";

/**
 * The plan the checkout is started for. One plan exists, and its identifier
 * travels to the server; the price and what it includes are said on the pricing
 * page, which is built from the list below.
 */
export const PRO_PLAN = "pro";

/**
 * What that plan costs, as a figure rather than as a sentence.
 *
 * Two things state it and they must not differ: the card a person reads, and
 * the structured data a search engine reads off the same page. Written out
 * twice they disagree at the first change of price, and the disagreement is
 * published to a crawler before anybody here notices it. The card formats this
 * number in the language being read; nothing anywhere types the price into a
 * string.
 */
export const planPrice = { amount: 0, currency: "USD" } as const;

/**
 * Everything the pricing page lists, in the order it lists them. Three of the
 * lines are not checks a job can run - Scout is a search, DiffChecker compares
 * two texts in the browser, and the download is what the editor gives back -
 * and they are on the list because a person choosing a plan is choosing the
 * product, not the four module identifiers the API happens to name.
 */
export type CapabilityId = ModuleId | "scout" | "diffchecker" | "download";

export type Capability = {
  readonly id: CapabilityId;
  readonly tier: Tier;
  /**
   * Whether a registered account gets one run of it before paying. It belongs
   * beside the tier because it is the same boundary seen from the other side,
   * and because it is why `allowed: true` and `access: false` arrive together.
   */
  readonly trial: boolean;
};

export const capabilities: readonly Capability[] = [
  { id: "scout", tier: "free", trial: false },
  { id: "cite", tier: "paid", trial: true },
  { id: "bibcheck", tier: "free", trial: false },
  { id: "presubmit", tier: "paid", trial: true },
  { id: "glossary", tier: "free", trial: false },
  { id: "diffchecker", tier: "free", trial: false },
  { id: "download", tier: "free", trial: false },
];

export function tierOf(id: CapabilityId): Tier {
  return capabilities.find((capability) => capability.id === id)?.tier ?? "free";
}

/** The checks a job can run that the paid boundary applies to. */
export const paidModules: readonly ModuleId[] = moduleIds.filter(
  (id) => tierOf(id) === "paid",
);

export function isPaidModule(id: ModuleId): boolean {
  return tierOf(id) === "paid";
}

/**
 * What the button in the lock's window does. Signing in and buying access are
 * different errands, and a window that offers the second to somebody who has
 * not done the first sends them to a payment form they cannot complete.
 *
 * A refusal with no reason in it is a case of its own rather than an empty
 * window: the person is told the check is not available and given the one place
 * where that is resolved.
 */
export type LockAction = "sign-in" | "upgrade";

export function lockActionFor(reason: LockReason | undefined): LockAction {
  return reason === "requires-account" ? "sign-in" : "upgrade";
}
