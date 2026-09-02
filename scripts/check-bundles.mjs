import { BUDGET_FILE, measure, readBudget } from "./bundle-sizes.mjs";

/**
 * What a page is allowed to weigh. Runs as part of `npm run build`, so a page
 * that grew says so where the growth happened rather than in CI an hour later.
 *
 * A budget is only worth having if going over it is a conversation. So this
 * does not raise anything by itself: it says by how much, and it names the one
 * command that records a new size - which lands in the diff of the change that
 * caused it, where somebody can ask about it.
 */
const budget = readBudget();
const sizes = measure();
const allowance = budget.headroomKb;

const rows = [];
let worst = null;

for (const [route, recorded] of Object.entries(budget.routes)) {
  const size = sizes[route];
  if (size === undefined) {
    console.error(`No measurement for ${route}: is it still in .size-limit.js?`);
    process.exit(1);
  }

  const limit = recorded + allowance;
  const over = Number((size - limit).toFixed(1));
  rows.push({ route, size, limit, over });
  if (over > 0 && (worst === null || over > worst.over)) worst = { route, over };
}

const width = Math.max(...rows.map((row) => row.route.length));
console.log("Bundle budgets");
for (const { route, size, over } of rows) {
  const verdict = over > 0 ? `over by ${over.toFixed(1)} kB` : "ok";
  console.log(
    `  ${route.padEnd(width)}  ${size.toFixed(1).padStart(7)} kB  ` +
      `${verdict.padEnd(18)} (recorded ${budget.routes[route].toFixed(1)} + ${allowance} allowed)`,
  );
}

if (worst === null) process.exit(0);

console.error("");
console.error(
  `${worst.route} is ${worst.over.toFixed(1)} kB past what was recorded for it.`,
);
console.error("");
console.error("If that growth is the point of this change, record it here too:");
console.error("");
console.error("    npm run size:update");
console.error("");
console.error(
  `That rewrites ${BUDGET_FILE}, so the new size arrives as a line in the diff`,
);
console.error("rather than as a limit quietly raised to fit.");
process.exit(1);
