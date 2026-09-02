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

export {
  zApiError,
  zEntitlements,
  zJobStatus,
  zModuleResult,
  zSubmitJobResponse,
  zVenueFetchResponse,
} from "@/lib/api/wire/zod.gen";
