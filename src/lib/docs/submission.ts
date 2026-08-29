import {
  type BufferItem,
  type CheckOptions,
  type SubmitDocument,
  type SubmitJobRequest,
} from "@/lib/domain";

import { docRegistry } from "./registry";
import { countCodePoints, sha256Hex } from "./units";

/**
 * Assembling what will be sent (§17, §18). It lives here because this is where
 * the text registry lives: the registry is joined to the API at the moment of
 * sending and nowhere else, and putting this in a feature would mean handing
 * document text to a screen.
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
   * leaves that alone (§17).
   */
  readonly payloadHash: string;
};

export async function buildSubmission(
  items: readonly BufferItem[],
  options: CheckOptions,
  locale: string,
): Promise<Submission | null> {
  const documents: SubmitDocument[] = [];

  for (const item of items) {
    const content = docRegistry.get(item.id);
    if (content === undefined) continue;

    documents.push({
      docId: item.id,
      // The raw name: sanitisation is a rule about how a name is shown (§18).
      name: item.rawName,
      role: item.role,
      format: item.sourceFormat,
      checks: item.checks,
      text: content.text,
      textSha256: await sha256Hex(content.text),
      cpLength: countCodePoints(content.text),
      ...(item.venue === undefined ? {} : { venue: item.venue }),
      ...(content.meta === undefined ? {} : { meta: content.meta }),
    });
  }

  if (documents.length === 0) return null;

  const request: SubmitJobRequest = { documents, options, locale };
  return { request, payloadHash: await hashOf(request) };
}

/**
 * Computed over the pairs rather than over the megabytes of text: the document
 * hashes have already been taken for the submission, so there is no second pass
 * over the text. A hash beats a version counter here, because an edit and its
 * undo give back the same body and therefore the same key (§17).
 */
async function hashOf(request: SubmitJobRequest): Promise<string> {
  const parts = request.documents.map(
    (document) =>
      `${document.docId}:${document.textSha256}:${[...document.checks].sort().join(",")}`,
  );
  return sha256Hex([...parts, JSON.stringify(request.options), request.locale].join("|"));
}
