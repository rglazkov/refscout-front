import { type JobDocument, type JobStatus } from "@/lib/domain";

/**
 * The results of several jobs read as one.
 *
 * Checks added from the results run as a job of their own, and the person reads
 * the findings of every job together: a document is one row however many jobs
 * checked it, and its cards are the checks of all of them. A job adds checks the
 * earlier ones did not run, so a document and a check meet in at most one job;
 * where they do meet twice, the later job's state is the one shown, because it
 * describes the newer attempt.
 *
 * The statuses are given oldest first. The merged state is the latest job's
 * identity - its identifier, state and stages - with the documents of all of
 * them, and the start of the earliest, because the results began there.
 */
export function mergeStatuses(statuses: readonly JobStatus[]): JobStatus | null {
  const latest = statuses.at(-1);
  if (latest === undefined) return null;
  if (statuses.length === 1) return latest;

  const order: string[] = [];
  const documents = new Map<string, JobDocument>();
  for (const status of statuses) {
    for (const document of status.documents) {
      const known = documents.get(document.docId);
      if (known === undefined) {
        order.push(document.docId);
        documents.set(document.docId, document);
        continue;
      }
      documents.set(document.docId, {
        ...document,
        modules: { ...known.modules, ...document.modules },
      });
    }
  }

  const first = statuses[0] ?? latest;
  return {
    ...latest,
    createdAt: first.createdAt,
    documents: order.flatMap((docId) => {
      const document = documents.get(docId);
      return document === undefined ? [] : [document];
    }),
  };
}
