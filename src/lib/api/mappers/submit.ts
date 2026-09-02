import {
  type CheckOptions,
  type SubmitDocument,
  type SubmitJobRequest,
  type VenueRef,
} from "@/lib/domain";
import {
  type CheckOptions as WireCheckOptions,
  type SubmitDocument as WireSubmitDocument,
  type SubmitJobRequest as WireSubmitJobRequest,
  type VenueRef as WireVenueRef,
} from "@/lib/api/wire";

/**
 * The outward half of the seam. The idempotency key is not here: it is about
 * delivery rather than about the content of the job, and travels as a
 * header.
 */
export function fromSubmitJobRequest(request: SubmitJobRequest): WireSubmitJobRequest {
  return {
    documents: request.documents.map(fromSubmitDocument),
    locale: request.locale,
  };
}

function fromSubmitDocument(document: SubmitDocument): WireSubmitDocument {
  return {
    docId: document.docId,
    // The raw name, not the displayed one: our sanitisation is a rule about
    // showing a name, and a name trimmed to 80 characters cannot be found again
    // in a support conversation.
    name: document.name,
    role: document.role,
    format: document.format,
    checks: [...document.checks],
    ...(document.uses === undefined ? {} : { uses: [...document.uses] }),
    options: fromCheckOptions(document.options),
    text: document.text,
    textSha256: document.textSha256,
    cpLength: document.cpLength,
    ...(document.venue?.docId === undefined
      ? {}
      : { venue: fromVenue({ ...document.venue, docId: document.venue.docId }) }),
    ...(document.meta === undefined ? {} : { meta: document.meta }),
  };
}

/**
 * The requirements themselves travel as a document of the job, like every other
 * text; what goes here is which way they were brought in and what the person
 * entered. Our own fetch states stay behind: they describe a request the
 * browser made and say nothing about the check.
 */
function fromVenue(venue: VenueRef & { readonly docId: string }): WireVenueRef {
  return {
    kind: venue.kind,
    source: venue.source,
    docId: venue.docId,
  };
}

function fromCheckOptions(options: CheckOptions): WireCheckOptions {
  return {
    bibcheck: { ...options.bibcheck },
    glossary: { ...options.glossary },
    presubmit: { ...options.presubmit },
    cite: { ...options.cite },
  };
}
