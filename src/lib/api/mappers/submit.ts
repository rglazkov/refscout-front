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
 * delivery rather than about the content of the job, and travels as a header
 * (§17, §18).
 */
export function fromSubmitJobRequest(request: SubmitJobRequest): WireSubmitJobRequest {
  return {
    documents: request.documents.map(fromSubmitDocument),
    options: fromCheckOptions(request.options),
    locale: request.locale,
  };
}

function fromSubmitDocument(document: SubmitDocument): WireSubmitDocument {
  return {
    docId: document.docId,
    // The raw name, not the displayed one: our sanitisation is a rule about
    // showing a name, and a name trimmed to 80 characters cannot be found again
    // in a support conversation (§18).
    name: document.name,
    role: document.role,
    format: document.format,
    checks: [...document.checks],
    ...(document.uses === undefined ? {} : { uses: [...document.uses] }),
    text: document.text,
    textSha256: document.textSha256,
    cpLength: document.cpLength,
    ...(document.venue === undefined ? {} : { venue: fromVenue(document.venue) }),
    ...(document.meta === undefined ? {} : { meta: document.meta }),
  };
}

/**
 * Only the requirements as text travel. The file a person chose is parsed in
 * the browser like every other document and never leaves it (§4, §18).
 */
function fromVenue(venue: VenueRef): WireVenueRef {
  return {
    kind: venue.kind,
    source: venue.source,
    ...(venue.text === undefined ? {} : { text: venue.text }),
    ...(venue.docId === undefined ? {} : { docId: venue.docId }),
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
