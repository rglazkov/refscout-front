import {
  type Counts,
  type Issue,
  type Job,
  type ModuleId,
  type ModuleResult,
  type ModuleStatus,
  type Severity,
  moduleIds,
} from "@/lib/domain";
import { track } from "@/lib/telemetry";

/**
 * Four modules answer in four shapes, and the whole interface works with one.
 * Because of that the list inside a card is the same component for every
 * module, the report assembled on download comes from the same array, and a new
 * module is connected by adding its codes and one renderer of details.
 */
export type PlacedIssue = {
  readonly docId: string;
  readonly module: ModuleId;
  readonly issue: Issue;
};

export function issuesOf(result: ModuleResult): readonly PlacedIssue[] {
  return result.issues.map((issue) => ({
    docId: result.docId,
    module: result.module,
    issue,
  }));
}

export const zeroCounts: Counts = { critical: 0, warning: 0, info: 0 };

export function addCounts(left: Counts, right: Counts): Counts {
  return {
    critical: left.critical + right.critical,
    warning: left.warning + right.warning,
    info: left.info + right.info,
  };
}

/**
 * The numbers a document's heading shows. Only the cards already on screen are
 * added up: a heading that reported checks which have not arrived yet would
 * name a number that cannot be found on the page, and the first thing a person
 * does is count the cards.
 */
export function documentCounts(
  modules: Readonly<Partial<Record<ModuleId, ModuleStatus>>>,
): Counts {
  let total = zeroCounts;
  for (const moduleId of moduleIds) {
    const status = modules[moduleId];
    if (status === undefined) continue;
    // Only a card that is on screen counts, and a card is on screen once its
    // module has reached a terminal state.
    if (status.state === "queued" || status.state === "running") continue;
    total = addCounts(total, status.counts);
  }
  return total;
}

/** The row at the top of the screen: the sum of the document rows. */
export function jobCounts(job: Job): Counts {
  let total = zeroCounts;
  for (const document of job.status.documents) {
    total = addCounts(total, documentCounts(document.modules));
  }
  return total;
}

export function countIssues(issues: readonly PlacedIssue[]): Counts {
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const placed of issues) counts[placed.issue.severity] += 1;
  return counts;
}

/**
 * The counters come from the poll and the findings come from the body, and the
 * two have to agree. When they do not, that is an event with an address rather
 * than a silent recount on the client: recounting would make the screen add up
 * while hiding that the server and the client disagree about the same job.
 */
export function verifyCounts(status: ModuleStatus, result: ModuleResult): boolean {
  const found = countIssues(issuesOf(result));
  const agrees = (["critical", "warning", "info"] as readonly Severity[]).every(
    (severity) => found[severity] === status.counts[severity],
  );
  if (!agrees) {
    track("schema_error", {
      code: `SCHEMA_MISMATCH:${result.module}.counts`,
      context: {
        critical: found.critical - status.counts.critical,
        warning: found.warning - status.counts.warning,
        info: found.info - status.counts.info,
      },
    });
  }
  return agrees;
}
