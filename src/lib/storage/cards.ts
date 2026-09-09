import { type BufferItem } from "@/lib/domain";

import { cardKey } from "./records";
import { commit } from "./writer";

/**
 * The descriptions the cards are drawn from - the ticks, the settings, the
 * companions, the venue, what the extraction found - written beside the texts
 * they describe.
 *
 * They hold no text and never will: what a store holds reaches the serialised
 * state and the error report soon after. The pair is kept in one store so that
 * a document and its card are removed together; a description outliving its
 * text would be a card that opens on nothing, and a text outliving its
 * description a manuscript nothing on screen can reach.
 */
export function writeCards(items: readonly BufferItem[]): Promise<void> {
  return commit((stores) => {
    for (const item of items) {
      stores.documents.put({ key: cardKey(item.id), docId: item.id, item });
    }
  }, "cards");
}

/** Removes the cards of documents that are no longer in the buffer. */
export function forgetCards(docIds: readonly string[]): Promise<void> {
  if (docIds.length === 0) return Promise.resolve();
  return commit((stores) => {
    for (const docId of docIds) stores.documents.delete(cardKey(docId));
  });
}
