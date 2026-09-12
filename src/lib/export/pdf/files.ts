import { type Severity } from "@/lib/domain";

/**
 * The small part of the report writer that a screen is allowed to know about.
 *
 * The writer itself embeds four whole faces and weighs two megabytes with them,
 * and it belongs to the worker that runs it. But the screen has the dictionary,
 * so it has to name the few words the page puts on - and naming them must not
 * drag the writer onto every page in the product. Hence a module that imports
 * nothing but a type.
 */

/**
 * The four faces the report is set in: the product's own, each doing the job it
 * does on the screen. Which file stands behind each one is settled where they
 * are built into the worker.
 */
export type Role = "sans" | "bold" | "serif" | "mono";

/**
 * The few words the page itself puts on, beyond the report's own text: the
 * running foot, and the names of the severities counted at the head of each
 * document. They live here rather than beside the drawing for the same reason
 * the role does - the screen that has the dictionary has to name them, and must
 * not pull the writer in to do it.
 */
export type PdfWording = {
  /**
   * The running foot, with `{page}` and `{total}` in it. Both are set in the
   * mono face wherever they land in the sentence, so the wording is free to put
   * them where its language puts them.
   */
  readonly pageNumbers: string;
  readonly severity: Readonly<Record<Severity, string>>;
};
