/**
 * Finding a fragment in a book without walking the book.
 *
 * Every pass of the resolver has to answer "and is it the only one?", which
 * means looking at the whole document rather than stopping at the first match.
 * Read naively that is a scan per place, and the numbers say what that costs: a
 * document may run to three million characters and a body may carry hundreds of
 * thousands of places, each searched in up to three passes. Tens of thousands
 * of full scans over three million characters is hours, and the tab does not
 * answer during them.
 *
 * So the document is indexed once per pass instead. A window of a fixed length
 * is hashed every few positions and the hashes are sorted; a fragment is looked
 * up by taking a handful of windows off its own head, one of which must line up
 * with a sampled position, and the positions behind those hashes are checked by
 * a direct comparison. What a place costs is then a few binary searches and a
 * comparison per candidate, and what a pass costs is one walk of the text.
 *
 * The index describes one exact state of one text. The first edit makes it
 * wrong, so it is built when a pass starts and dropped when the pass ends,
 * never kept.
 */

/** The length of the hashed window, in units of the string it is built over. */
const WINDOW = 16;

/** How far apart the sampled positions are. */
const STEP = 8;

/**
 * The shortest fragment that can be looked up at all. With windows every eight
 * positions, a fragment of this length is guaranteed to contain one of them,
 * and a shorter one may sit entirely between two samples. A fragment below it
 * is not searched: the contract has a module send the neighbouring text with
 * every place it reports, and the key is the fragment together with that
 * context, so a key this short means a module that did not send it.
 */
export const MIN_KEY_LENGTH = WINDOW + STEP - 1;

export type TextIndex = {
  readonly text: string;
  /** Sorted, with `positions` carried along in the same order. */
  readonly hashes: Uint32Array;
  readonly positions: Uint32Array;
};

/** FNV-1a over one window, which is enough spread for a bucket to be short. */
function hashAt(text: string, at: number): number {
  let hash = 0x811c9dc5;
  for (let unit = 0; unit < WINDOW; unit += 1) {
    hash ^= text.charCodeAt(at + unit);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Sorted by hash, in four passes over the bytes of the key rather than by
 * comparison. On the largest document this is three hundred and seventy-five
 * thousand entries, and a comparison sort of that is a visible part of the
 * budget for no reason: the keys are 32-bit integers, which is the one case
 * where counting beats comparing.
 */
function sortByHash(
  hashes: Uint32Array<ArrayBuffer>,
  positions: Uint32Array<ArrayBuffer>,
): void {
  const length = hashes.length;
  let keys: Uint32Array<ArrayBuffer> = hashes;
  let values: Uint32Array<ArrayBuffer> = positions;
  let keyBuffer = new Uint32Array(length);
  let valueBuffer = new Uint32Array(length);
  const counts = new Uint32Array(256);

  for (let shift = 0; shift < 32; shift += 8) {
    counts.fill(0);
    for (let at = 0; at < length; at += 1) {
      const bucket = ((keys[at] ?? 0) >>> shift) & 0xff;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    let total = 0;
    for (let bucket = 0; bucket < 256; bucket += 1) {
      const count = counts[bucket] ?? 0;
      counts[bucket] = total;
      total += count;
    }
    for (let at = 0; at < length; at += 1) {
      const key = keys[at] ?? 0;
      const bucket = (key >>> shift) & 0xff;
      const target = counts[bucket] ?? 0;
      counts[bucket] = target + 1;
      keyBuffer[target] = key;
      valueBuffer[target] = values[at] ?? 0;
    }
    const swappedKeys = keys;
    const swappedValues = values;
    keys = keyBuffer;
    values = valueBuffer;
    keyBuffer = swappedKeys;
    valueBuffer = swappedValues;
  }

  // Four passes over four bytes is an even number of swaps, so the sorted data
  // ends up in the arrays it started in and there is nothing to copy back.
  hashes.set(keys);
  positions.set(values);
}

export function buildIndex(text: string): TextIndex {
  const samples =
    text.length < WINDOW ? 0 : Math.floor((text.length - WINDOW) / STEP) + 1;
  const hashes = new Uint32Array(samples);
  const positions = new Uint32Array(samples);
  for (let sample = 0; sample < samples; sample += 1) {
    const at = sample * STEP;
    hashes[sample] = hashAt(text, at);
    positions[sample] = at;
  }
  sortByHash(hashes, positions);
  return { text, hashes, positions };
}

/** The first entry whose hash is not below the one asked for. */
function lowerBound(hashes: Uint32Array, hash: number): number {
  let low = 0;
  let high = hashes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((hashes[middle] ?? 0) < hash) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Where the fragment occurs, up to `limit` of them. The limit is what keeps a
 * common fragment cheap: the answer the resolver wants is "once, or more than
 * once", so two confirmed matches settle the question and the rest of the
 * document need not be checked. A fragment shorter than a window cannot be
 * looked up and gives back nothing - the caller has already refused it.
 */
export function occurrences(
  index: TextIndex,
  needle: string,
  limit = 2,
): readonly number[] {
  if (needle.length < MIN_KEY_LENGTH) return [];

  const found: number[] = [];
  const seen = new Set<number>();
  for (let offset = 0; offset < STEP; offset += 1) {
    const hash = hashAt(needle, offset);
    for (let at = lowerBound(index.hashes, hash); at < index.hashes.length; at += 1) {
      if (index.hashes[at] !== hash) break;
      const start = (index.positions[at] ?? 0) - offset;
      if (start < 0 || seen.has(start)) continue;
      seen.add(start);
      // The hash agreeing is a candidate, never an answer: what settles it is
      // the characters themselves.
      if (index.text.startsWith(needle, start)) {
        found.push(start);
        if (found.length >= limit) return found;
      }
    }
  }
  return found;
}
