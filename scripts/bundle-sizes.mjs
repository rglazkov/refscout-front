import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * One measurement, used by both the check and the re-record.
 *
 * It comes from size-limit itself rather than from a second implementation
 * here: two ways of gzipping the same files disagree by a few kilobytes, and a
 * budget compared against a number produced differently is a budget that is
 * wrong by exactly that much. The binary is run directly rather than through
 * npx, so nothing about this depends on the platform.
 */
export const BUDGET_FILE = "budget.json";

/** size-limit states its limits in kB - a thousand bytes, not 1024. */
const KB = 1000;

export function readBudget() {
  return JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
}

/** Route name to size in kB, as size-limit measures it. */
export function measure() {
  const measured = JSON.parse(
    execFileSync(process.execPath, ["node_modules/size-limit/bin.js", "--json"], {
      encoding: "utf8",
    }),
  );

  const sizes = {};
  for (const { name, size } of measured) sizes[name] = Number((size / KB).toFixed(1));
  return sizes;
}
