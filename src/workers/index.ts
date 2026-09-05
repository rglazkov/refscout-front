/*
 * From the module itself rather than through its door, and for the same reason
 * the resolver's own worker does it: the door also opens onto the projection,
 * which reaches the registry of texts and would be dragged in here by a type.
 */
import { type ResolveRequest, type ResolveResult } from "@/lib/anchor/resolve";
import { type DiffResult } from "@/lib/diff/text";
import { type Reading } from "@/lib/parse/reading";
import { type ParseRequest, type Parsed, type PdfResources } from "@/lib/parse/types";
import { publicPath } from "@/lib/public-path";

import { createWorkerClient, type RunOptions } from "./client";
import { type DiffRequest } from "./diff.worker";
import { type CompressRequest, type CompressResult } from "./gzip";
import {
  assembleCall,
  compressCall,
  diffCall,
  parseCall,
  readCall,
  resolveCall,
  type AssembleRequest,
  type ReadRequest,
} from "./protocol";

export { COMPRESS_ABOVE_BYTES, type CompressResult } from "./gzip";
/*
 * The door into the comparison, on the same terms as the parsers: what a screen
 * needs from there is the limits it has to name and the shape of the answer.
 */
export {
  countLines,
  diffLimits,
  type DiffChange,
  type DiffResult,
} from "@/lib/diff/text";
export { type RunOptions, type WorkerClient } from "./client";
/*
 * The door into the parsers, and the only one. `lib/parse` is reachable from
 * this folder and from the tests alone - an architectural test says so - which
 * is what "nothing is parsed outside a worker" means in practice. What a screen
 * needs from there is a failure it can read and a verdict on the text, and both
 * come back out through here.
 */
export { ParseFailure, isParseFailure, type ParseFailureData } from "@/lib/parse/failure";
export {
  assess,
  measure,
  type Measured,
  type Quality,
  type TextStats,
} from "@/lib/parse/quality";
export { type ParseProgress, type Parsed } from "@/lib/parse/types";
export type { Reading };

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

const DIFF_WORKER = publicPath("/workers/diff.worker.js");

const RESOLVE_WORKER = publicPath("/workers/resolve.worker.js");

/**
 * The same two, built as classic scripts with nothing to import. They are only
 * reached when the module worker above will not start: everything is in the one
 * file, so a person on such a browser downloads both parsers instead of the one
 * their document needed - which is the right price for the product working at
 * all there.
 */
const CLASSIC_PARSE_WORKER = publicPath("/workers/classic/parse.worker.js");

const CLASSIC_GZIP_WORKER = publicPath("/workers/classic/gzip.worker.js");

const CLASSIC_DIFF_WORKER = publicPath("/workers/classic/diff.worker.js");

const CLASSIC_RESOLVE_WORKER = publicPath("/workers/classic/resolve.worker.js");

/**
 * The workers of the product and the only way in to any of them. Callers see
 * functions that take data and give data back; the workers, the envelopes and
 * the listeners stay inside this folder.
 *
 * Both are created on first use. A person reading the legal pages never starts
 * a worker, and a person who brought a `.bib` never downloads pdf.js: the
 * parser chunk is reached through `import()` inside the worker and arrives with
 * the document that needs it.
 */
/**
 * How many documents may be read at once.
 *
 * Parsing is the one kind of work here that a person asks for several of at a
 * time - fifty files dropped together - and each of them is a whole core for
 * seconds. So there is a pool rather than a single worker, and its size is
 * taken from the machine: one fewer than the cores it reports, so the thread
 * that draws the cards keeps one to itself.
 *
 * The ceiling of three is about memory rather than about cores. A hundred
 * megabytes of PDF being inflated is hundreds of megabytes in the tab, and four
 * of those at once on a phone is a tab the browser ends - which is a worse
 * outcome than reading the documents one after another. `undefined` is a
 * browser that does not say, and the answer to a question that was not answered
 * is the modest one.
 */
const PARSE_POOL_SIZE = Math.max(
  1,
  Math.min(3, (globalThis.navigator?.hardwareConcurrency ?? 4) - 1),
);

const parser = createWorkerClient<ParseRequest, Parsed>(
  [
    () => new Worker(PARSE_WORKER, { type: "module" }),
    () => new Worker(CLASSIC_PARSE_WORKER),
  ],
  parseCall,
  PARSE_POOL_SIZE,
);

const compressor = createWorkerClient<CompressRequest, CompressResult>(
  [
    () => new Worker(GZIP_WORKER, { type: "module" }),
    () => new Worker(CLASSIC_GZIP_WORKER),
  ],
  compressCall,
);

const comparator = createWorkerClient<DiffRequest, DiffResult>(
  [
    () => new Worker(DIFF_WORKER, { type: "module" }),
    () => new Worker(CLASSIC_DIFF_WORKER),
  ],
  diffCall,
);

const resolver = createWorkerClient<ResolveRequest, ResolveResult>(
  [
    () => new Worker(RESOLVE_WORKER, { type: "module" }),
    () => new Worker(CLASSIC_RESOLVE_WORKER),
  ],
  resolveCall,
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
 * Reads the structure of a text that has one, over a text that is already in
 * the browser. It is called after an edit as well as after a parse: the entries
 * of a bibliography move as it is corrected, and a duplicate key the person has
 * just removed must stop being reported the moment they remove it.
 */
export function readStructureOf(
  request: ReadRequest,
  options: RunOptions = {},
): Promise<Reading> {
  return parser.ask<ReadRequest, Reading>(readCall, request, options);
}

/**
 * Writes a Word file back out of the markdown it became, and hands back its
 * bytes. It goes to the same pool the parsers use, because the work is the same
 * kind and the same size: a hundred pages of markdown rendered and packed would
 * be seconds of a frozen tab on the thread the page is drawn on.
 */
export function assembleDocxFile(
  request: AssembleRequest,
  options: RunOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  return parser.ask<AssembleRequest, Uint8Array<ArrayBuffer>>(
    assembleCall,
    request,
    options,
  );
}

/**
 * Compares two texts in a worker. The whole of the comparison happens there:
 * what comes back is the finished set of changed ranges, and the page never
 * runs the pass over both texts itself.
 *
 * Cancelling ends the worker, which is the only way to stop work that is
 * already inside a synchronous pass - the same rule the parsers follow.
 */
export function compareTexts(
  request: DiffRequest,
  options: RunOptions = {},
): Promise<DiffResult> {
  return comparator.run(request, options);
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

/**
 * Works out where each place of an answer falls on the live text. It is one
 * call per module answer and one more each time the text settles after being
 * edited, and the whole of it - the index over the document, the three passes,
 * the checking of the neighbouring text - happens off the thread the editor is
 * drawn on.
 */
export function resolvePlaces(
  request: ResolveRequest,
  options: RunOptions = {},
): Promise<ResolveResult> {
  return resolver.run(request, options);
}
