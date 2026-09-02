/**
 * Compressing the request body. `fetch` does not compress what it sends, so
 * either we do it or it does not happen - and on a dissertation that is the
 * difference between a two-minute upload and a half-minute one, or between a
 * submission and a proxy refusing the body outright.
 *
 * The function is here, on its own, so that the worker beside it stays four
 * lines and so that the compression itself can be tested without one.
 */
export type CompressRequest = { readonly json: string };

export type CompressResult = {
  readonly bytes: Uint8Array;
  /** False when the body was small enough that compressing it was not worth it. */
  readonly compressed: boolean;
};

/**
 * Below this the JSON is sent as it stands: a few kilobytes through the
 * compressor costs more than the handful of bytes it saves, and the upload was
 * never the slow part at that size. Both forms are valid on this endpoint at
 * any size, so the number is ours alone and the server neither knows it nor
 * depends on it.
 */
export const COMPRESS_ABOVE_BYTES = 64 * 1024;

export async function compress(json: string): Promise<CompressResult> {
  const raw = new TextEncoder().encode(json);
  if (raw.byteLength < COMPRESS_ABOVE_BYTES) return { bytes: raw, compressed: false };

  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
  }

  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return { bytes, compressed: true };
}
