/**
 * A zod schema for every response we read. They are generated from the contract
 * together with the wire types, so a schema cannot drift away from what was
 * agreed; this module is the curated list of the ones the client actually
 * parses, and the only place outside `wire/` that names them.
 *
 * Every answer is parsed rather than cast. Practically every "a null appeared
 * on the page" is an unparsed server response, and a strict schema turns it
 * from a visual bug into an event with the address of the field.
 */

// Before the schemas themselves: the flag it sets is read as they are built.
import "./jitless";

// The namespace form, as in the generated schemas: importing the `z` binding
// itself keeps every part of zod the bundle can reach - the locale tables and
// the JSON-Schema generator among them - and costs about sixty kilobytes for
// one call to `z.string()`.
import * as z from "zod";

import { zModuleResult as zStrictModuleResult } from "@/lib/api/wire/zod.gen";

export {
  zApiError,
  zEntitlements,
  zExportAccountDataResponse,
  zJobStatus,
  zRedirectUrl,
  zScoutResponse,
  zSessionResponse,
  zSubmitJobResponse,
  zVenueFetchResponse,
} from "@/lib/api/wire/zod.gen";

/**
 * The one relaxation of a generated schema in the project, and it is one field.
 *
 * The contract allows exactly one unit for offsets, and the generated schema
 * holds that value as a constant - so a body declaring another unit fails to
 * parse, and the module comes out as a failure with no findings in it. That is
 * the wrong answer to the wrong question. The unit is about where a finding is,
 * not about whether it exists: a body counted in a unit we do not accept still
 * carries findings the person paid for, and the design is that they are shown
 * without places rather than thrown away.
 *
 * So the field is read as a string here and judged afterwards, in the open,
 * where the verdict is "the places in this body cannot be used" rather than
 * "this body did not arrive".
 */
export const zModuleResult = zStrictModuleResult.extend({ offsetUnit: z.string() });

export type IncomingModuleResult = z.output<typeof zModuleResult>;
