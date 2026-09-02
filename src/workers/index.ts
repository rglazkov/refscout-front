import { type ParseRequest, type Parsed, type PdfResources } from "@/lib/parse/types";
import { publicPath } from "@/lib/public-path";

import { createWorkerClient, type RunOptions } from "./client";
import { type CompressRequest, type CompressResult } from "./gzip";
import { compressCall, parseCall } from "./protocol";

export { COMPRESS_ABOVE_BYTES, type CompressResult } from "./gzip";
export { type RunOptions, type WorkerClient } from "./client";
/*
 * The door into the parsers, and the only one. `lib/parse` is reachable from
 * this folder and from the tests alone - an architectural test says so - which
 * is what "nothing is parsed outside a worker" means in practice. What a screen
 * needs from there is a failure it can read and a verdict on the text, and both
 * come back out through here.
 */
export { ParseFailure, isParseFailure, type ParseFailureData } from "@/lib/parse/failure";
export { assess, type Quality } from "@/lib/parse/quality";
export { type ParseProgress, type Parsed } from "@/lib/parse/types";

/**
 * Where the built workers live. They are files of our own, built by
 * scripts/build-workers.mjs into public/workers, rather than something the
 * application bundler assembles: its way of shipping a worker does not start in
 * Firefox at all, and it fails silently, which is the one way a worker must
 * never fail.
 *
 * Module workers, because that is what makes the `import()` inside them work -
 * which is what keeps pdf.js away from a person who brought a `.bib`.
 */
const PARSE_WORKER = publicPath("/workers/parse.worker.js");

const GZIP_WORKER = publicPath("/workers/gzip.worker.js");

/**
 * The same two, built as classic scripts with nothing to import. They are only
 * reached when the module worker above will not start: everything is in the one
 * file, so a person on such a browser downloads both parsers instead of the one
 * their document needed - which is the right price for the product working at
 * all there.
 */
const CLASSIC_PARSE_WORKER = publicPath("/workers/classic/parse.worker.js");

const CLASSIC_GZIP_WORKER = publicPath("/workers/classic/gzip.worker.js");

/**
 * The two workers of the product and the only way in to either. Callers see
 * functions that take data and give data back; the workers, the envelopes and
 * the listeners stay inside this folder.
 *
 * Both are created on first use. A person reading the legal pages never starts
 * a worker, and a person who brought a `.bib` never downloads pdf.js: the
 * parser chunk is reached through `import()` inside the worker and arrives with
 * the document that needs it.
 */
const parser = createWorkerClient<ParseRequest, Parsed>(
  [
    () => new Worker(PARSE_WORKER, { type: "module" }),
    () => new Worker(CLASSIC_PARSE_WORKER),
  ],
  parseCall,
);

const compressor = createWorkerClient<CompressRequest, CompressResult>(
  [
    () => new Worker(GZIP_WORKER, { type: "module" }),
    () => new Worker(CLASSIC_GZIP_WORKER),
  ],
  compressCall,
);

/**
 * Where pdf.js finds its character maps, its standard fonts and its wasm. They
 * are copied beside the build rather than fetched from anywhere, and they are
 * addressed absolutely because a worker's own base address is a bundler's chunk
 * folder rather than the page.
 */
const PDFJS_PATHS = {
  cMapUrl: publicPath("/pdfjs/cmaps/"),
  standardFontDataUrl: publicPath("/pdfjs/standard_fonts/"),
  wasmUrl: publicPath("/pdfjs/wasm/"),
  iccUrl: publicPath("/pdfjs/iccs/"),
} as const;

/**
 * Made absolute here, on the main thread, and passed into the worker as text.
 * A worker resolves a relative address against its own script - a folder of
 * bundled chunks - rather than against the page, and the folder these live in
 * is a fact about the site rather than about the bundle.
 */
export function pdfResources(): PdfResources {
  const base = globalThis.location?.href ?? "/";
  return {
    cMapUrl: new URL(PDFJS_PATHS.cMapUrl, base).href,
    standardFontDataUrl: new URL(PDFJS_PATHS.standardFontDataUrl, base).href,
    wasmUrl: new URL(PDFJS_PATHS.wasmUrl, base).href,
    iccUrl: new URL(PDFJS_PATHS.iccUrl, base).href,
  };
}

export function extract(
  request: ParseRequest,
  options: RunOptions = {},
): Promise<Parsed> {
  return parser.run(
    request.format === "pdf" ? { ...request, resources: pdfResources() } : request,
    options,
  );
}

/**
 * Compresses a body in a worker. The caller decides whether it is worth doing:
 * starting a worker to find out that a few kilobytes were not worth compressing
 * costs more than the compression would have saved.
 */
export function compressBody(
  json: string,
  options: RunOptions = {},
): Promise<CompressResult> {
  return compressor.run({ json }, options);
}
