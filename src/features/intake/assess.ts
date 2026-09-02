import { type ExtractedText } from "@/lib/docs";
import {
  type ExtractFailureCode,
  type ExtractFailureParams,
  type ExtractState,
} from "@/lib/domain";
import { assess } from "@/workers";

/**
 * What state a document that parsed without complaint is really in. A parser
 * saying "no error" is not the same as a usable document: a scan gives an empty
 * string, a mis-guessed encoding gives a page of replacement characters, and
 * both look like success from inside pdf.js.
 *
 * The three outcomes are separate on purpose. "Nothing came out" and "something
 * came out and it is wrong" need different sentences and different ways out,
 * and "some pages are missing" is neither: the document works, and the person
 * needs to know which part of it is not there.
 */
export type Assessment = {
  readonly state: ExtractState;
  readonly code?: ExtractFailureCode;
  readonly params?: ExtractFailureParams;
  readonly printableRatio?: number;
};

export function assessText(
  extracted: ExtractedText,
  missingPages?: readonly number[],
): Assessment {
  const quality = assess(extracted.text);

  if (quality.empty) {
    return { state: "empty", code: "TEXT_EMPTY", printableRatio: 0 };
  }

  if (quality.suspicious) {
    // Replacement characters mean the bytes did not decode as the text they
    // were meant to be, which is a different sentence from "this came out as
    // rubbish and we do not know why" - and it has a way out of its own.
    const misread = quality.replacements > 0 || extracted.repaired > 0;
    return {
      state: "suspicious",
      code: misread ? "TEXT_BAD_ENCODING" : "TEXT_SUSPICIOUS",
      params: {
        printableRatio: round(quality.printableRatio),
        replacements: quality.replacements,
      },
      printableRatio: quality.printableRatio,
    };
  }

  if (missingPages !== undefined && missingPages.length > 0) {
    return {
      state: "partial",
      code: "PAGES_MISSING",
      printableRatio: quality.printableRatio,
    };
  }

  return { state: "ready", printableRatio: quality.printableRatio };
}

/** Three decimals: enough to tell 0.997 from 0.62, and a number telemetry can add up. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
