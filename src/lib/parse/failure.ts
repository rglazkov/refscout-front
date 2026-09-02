import { type ExtractFailureCode, type ExtractFailureParams } from "@/lib/domain";

/**
 * A refusal from a parser, as data. It crosses a worker boundary, so only a
 * code and a record of numbers survive: nothing here is a class the other side
 * could reconstruct, and nothing is a sentence, because the sentence is written
 * in the dictionary of whichever language is on screen.
 *
 * The codes themselves are in `lib/domain`, with the enumerations the whole
 * application speaks in: the worker produces one and the card reads it, and
 * neither should have to import the other.
 */
export type ParseFailureCode = ExtractFailureCode;

export type ParseFailureParams = ExtractFailureParams;

export type ParseFailureData = {
  readonly code: ParseFailureCode;
  readonly params?: ParseFailureParams;
};

export class ParseFailure extends Error {
  readonly code: ParseFailureCode;
  readonly params: ParseFailureParams | undefined;

  constructor(code: ParseFailureCode, params?: ParseFailureParams) {
    super(code);
    this.name = "ParseFailure";
    this.code = code;
    this.params = params;
  }

  toData(): ParseFailureData {
    return {
      code: this.code,
      ...(this.params === undefined ? {} : { params: this.params }),
    };
  }
}

export function isParseFailure(value: unknown): value is ParseFailure {
  // Checked by name as well as by prototype: the failure is rebuilt on the
  // other side of a worker, and an instance from another module realm would
  // otherwise be mistaken for a defect of ours.
  return (
    value instanceof ParseFailure ||
    (value instanceof Error && value.name === "ParseFailure")
  );
}
