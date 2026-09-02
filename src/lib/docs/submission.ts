import {
  type BufferItem,
  type SubmitDocument,
  type SubmitJobRequest,
} from "@/lib/domain";

import { docRegistry } from "./registry";
import { recordSnapshot } from "./snapshot";
import { countCodePoints, sha256Hex } from "./units";

/**
 * Assembling what will be sent. It lives here because this is where the text
 * registry lives: the registry is joined to the API at the moment of sending
 * and nowhere else, and putting this in a feature would mean handing document
 * text to a screen.
 *
 * The text goes out verbatim. Nothing is normalised on the way: the person gets
 * the file back, several checks look for exactly the characters a tidy-up would
 * remove, and every offset in the answer is counted over this string.
 */
export type Submission = {
  readonly request: SubmitJobRequest;
  /**
   * SHA-256 over a short string of docId:textSha256 pairs together with the
   * modules and the options. Not the same hash as `textSha256`: that one is
   * about a single document and travels to the server, this one is about the
   * whole submission and travels nowhere. Removing a tick changes this and
   * leaves that alone.
   */
  readonly payloadHash: string;
};

export async function buildSubmission(
  items: readonly BufferItem[],
  locale: string,
): Promise<Submission | null> {
  const documents: SubmitDocument[] = [];

  for (const item of items) {
    const content = docRegistry.get(item.id);
    if (content === undefined) continue;

    // Only the companions of the checks that are actually running. A companion
    // named for a check the person then unticked would send a document nothing
    // in the job reads.
    const uses = [
      ...new Set(
        item.checks.flatMap((moduleId) => {
          const companion = item.companions[moduleId];
          return companion === undefined ? [] : [companion];
        }),
      ),
    ];

    const textSha256 = await sha256Hex(content.text);
    const cpLength = countCodePoints(content.text);
    /*
     * Kept before the request is built, and kept for every document that goes
     * out. When the answer comes back declaring what the server counted over,
     * this is the only thing left to compare it with: the text itself may have
     * been corrected since, and its hash then answers a different question.
     */
    recordSnapshot(item.id, { textSha256, cpLength });

    documents.push({
      docId: item.id,
      // The raw name: sanitisation is a rule about how a name is shown.
      name: item.rawName,
      role: item.role,
      format: item.sourceFormat,
      checks: item.checks,
      ...(uses.length === 0 ? {} : { uses }),
      options: item.options,
      text: content.text,
      textSha256,
      cpLength,
      // A venue whose requirements never arrived is not a venue for the check:
      // what PreSubmit reads is the text, and there is none.
      ...(item.venue?.docId === undefined ? {} : { venue: item.venue }),
      ...(content.meta === undefined ? {} : { meta: content.meta }),
    });
  }

  if (documents.length === 0) return null;

  const request: SubmitJobRequest = { documents, locale };
  return { request, payloadHash: await hashOf(request) };
}

/**
 * The texts a check reads without being run on them, added to the set that is
 * sent. They travel with an empty `checks`: the job carries the bibliography so
 * that BibCheck can see which entries the manuscript cites, the glossary file
 * so that Glossary leaves the declared acronyms alone, and the venue's
 * requirements so that PreSubmit has something to check against. The plan on
 * each card has already said that this is what will happen.
 */
export function withCompanions(
  running: readonly BufferItem[],
  all: readonly BufferItem[],
): readonly BufferItem[] {
  const sent = new Set(running.map((item) => item.id));
  const extra: BufferItem[] = [];
  const take = (id: string | undefined): void => {
    if (id === undefined || sent.has(id)) return;
    const companion = all.find((candidate) => candidate.id === id);
    if (companion === undefined) return;
    sent.add(id);
    extra.push({ ...companion, checks: [] });
  };
  for (const item of running) {
    for (const moduleId of item.checks) take(item.companions[moduleId]);
    if (item.checks.includes("presubmit")) take(item.venue?.docId);
  }
  return [...running, ...extra];
}

/**
 * Computed over the pairs rather than over the megabytes of text: the document
 * hashes have already been taken for the submission, so there is no second pass
 * over the text. A hash beats a version counter here, because an edit and its
 * undo give back the same body and therefore the same key.
 */
async function hashOf(request: SubmitJobRequest): Promise<string> {
  const parts = request.documents.map(
    (document) =>
      `${document.docId}:${document.textSha256}:${[...document.checks].sort().join(",")}` +
      `:${[...(document.uses ?? [])].sort().join(",")}` +
      `:${JSON.stringify(document.options)}`,
  );
  return sha256Hex([...parts, request.locale].join("|"));
}
