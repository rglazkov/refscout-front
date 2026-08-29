import { writeFileSync } from "node:fs";

import { BUDGET_FILE, measure, readBudget } from "./bundle-sizes.mjs";

/**
 * Re-records what each page currently costs into `budget.json`.
 *
 * A tripwire that moves itself catches nothing, so this is never run by CI or
 * by a build. It is run by a person, in the change that made a page heavier,
 * and the new number lands in the diff of that change.
 *
 *   npm run build && npm run size:update
 */
const budget = readBudget();
const routes = measure();

for (const [route, size] of Object.entries(routes)) {
  const was = budget.routes[route];
  const change = was === undefined ? "new" : `was ${was.toFixed(1)} kB`;
  console.log(`  ${route.padEnd(14)} ${size.toFixed(1)} kB gzip  (${change})`);
}

writeFileSync(
  BUDGET_FILE,
  `${JSON.stringify(
    { ...budget, measuredAt: new Date().toISOString().slice(0, 10), routes },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `Recorded in ${BUDGET_FILE}. The build objects above the recorded size ` +
    `plus ${budget.headroomKb} kB.`,
);
