/**
 * The two rewritten forms a search falls back to, each carrying a map back to
 * the text it was made from.
 *
 * A quote does not always arrive character for character. A module that works
 * on its own reading of the document - hyphenation removed, words glued back
 * together across line breaks, formulas stripped - has a fragment that says the
 * same thing in different characters: our soft hyphen is not there, our line
 * break is a space, our non-breaking space is a space, our typographic quotation
 * mark is a straight one. An exact comparison never succeeds on such a
 * fragment, so without these forms a whole class of findings would be
 * unplaceable by construction rather than by accident.
 *
 * Nothing here changes the document. The forms exist for the length of one
 * resolver pass and are compared against; what a search returns is a range in
 * the original text, translated back through the map. The stored text is not
 * touched by a character, which is a promise the product makes about the
 * manuscript and not an implementation detail.
 */

/**
 * A rewritten text and, for every unit of it, where in the original that unit
 * came from. The map has one entry more than the text is long, so that the end
 * of a match translates as readily as its start.
 */
export type Rewritten = {
  readonly text: string;
  readonly map: Uint32Array;
};

/** The rewrite changed nothing, so the original stands in for it. */
export function isIdentity(form: Rewritten, source: string): boolean {
  return form.text === source;
}

const SOFT_HYPHEN = 0x00ad;
const ZERO_WIDTH_SPACE = 0x200b;

/**
 * Characters that carry nothing a comparison should see. Zero-width joiners and
 * non-joiners are deliberately not here: in Arabic, Persian and the scripts of
 * India they decide how letters join and what a grapheme is made of, so
 * dropping them would glue distinct words into one search key.
 */
function isDropped(code: number): boolean {
  return code === SOFT_HYPHEN || code === ZERO_WIDTH_SPACE;
}

function isSpace(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0b ||
    code === 0x0c ||
    code === 0x0d ||
    code === 0x85 ||
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000
  );
}

/**
 * Quotation marks and dashes are straightened, and they are the only characters
 * of their kind that are. Almost every text pipeline in existence turns one
 * into the other in one direction or the other, and telling them apart helps
 * nothing here: the words between them are the same, and no fragment becomes a
 * false match by having its quotes straightened. Characters that mean something
 * by themselves are never folded - the ASCII that is significant to LaTeX
 * stands as it is.
 */
function straighten(code: number): string | null {
  switch (code) {
    case 0x2018:
    case 0x2019:
    case 0x201a:
    case 0x201b:
    case 0x2039:
    case 0x203a:
    case 0xff07:
      return "'";
    case 0x201c:
    case 0x201d:
    case 0x201e:
    case 0x201f:
    case 0x00ab:
    case 0x00bb:
    case 0xff02:
      return '"';
    case 0x2010:
    case 0x2011:
    case 0x2012:
    case 0x2013:
    case 0x2014:
    case 0x2015:
    case 0x2212:
    case 0xfe58:
    case 0xfe63:
    case 0xff0d:
      return "-";
    default:
      return null;
  }
}

const COMBINING = /\p{M}/u;

/** Where the code point starting at `at` ends, one unit on or two. */
function pointEnd(text: string, at: number): number {
  const code = text.charCodeAt(at);
  if (code >= 0xd800 && code <= 0xdbff && at + 1 < text.length) {
    const next = text.charCodeAt(at + 1);
    if (next >= 0xdc00 && next <= 0xdfff) return at + 2;
  }
  return at + 1;
}

/**
 * One base character together with the marks that hang off it - which is the
 * unit composition happens inside. Normalising the document as a whole would be
 * simpler and would give no way back: composition changes lengths, so a
 * position in the normalised string would say nothing about a position in the
 * document. Normalising a cluster at a time keeps the answer and the map
 * together.
 */
function clusterEnd(text: string, at: number): number {
  let end = pointEnd(text, at);
  while (end < text.length) {
    const code = text.charCodeAt(end);
    // Only the range where marks live is tested against the property, because
    // this runs once per character of a manuscript.
    if (code < 0x0300) break;
    const next = pointEnd(text, end);
    if (!COMBINING.test(text.slice(end, next))) break;
    end = next;
  }
  return end;
}

type Builder = {
  readonly parts: string[];
  readonly sources: number[];
  length: number;
};

function emit(into: Builder, piece: string, from: number): void {
  if (piece === "") return;
  into.parts.push(piece);
  for (let unit = 0; unit < piece.length; unit += 1) into.sources.push(from);
  into.length += piece.length;
}

function finish(into: Builder, sourceLength: number): Rewritten {
  const map = new Uint32Array(into.length + 1);
  for (let unit = 0; unit < into.length; unit += 1) map[unit] = into.sources[unit] ?? 0;
  map[into.length] = sourceLength;
  return { text: into.parts.join(""), map };
}

/**
 * The text composed, and nothing else changed. This is the second pass of a
 * search: the same characters written the other way round - a letter and its
 * accent as two code points where we hold one - is the commonest disagreement
 * of all, and it is worth answering before anything is folded away.
 */
export function nfcForm(text: string): Rewritten {
  const into: Builder = { parts: [], sources: [], length: 0 };
  for (let at = 0; at < text.length;) {
    const end = clusterEnd(text, at);
    const cluster = text.slice(at, end);
    emit(into, end - at === 1 ? cluster : cluster.normalize("NFC"), at);
    at = end;
  }
  return finish(into, text.length);
}

/**
 * The text with everything a pipeline flattens flattened: composed, lower case,
 * one space for any run of whitespace and for a line break with its
 * surroundings, straight quotes, one kind of dash, and the invisible characters
 * that carry nothing gone.
 */
export function foldedForm(text: string): Rewritten {
  const into: Builder = { parts: [], sources: [], length: 0 };
  for (let at = 0; at < text.length;) {
    const code = text.charCodeAt(at);

    if (isSpace(code)) {
      const from = at;
      while (at < text.length && isSpace(text.charCodeAt(at))) at += 1;
      emit(into, " ", from);
      continue;
    }

    if (isDropped(code)) {
      at += 1;
      continue;
    }

    const straightened = straighten(code);
    if (straightened !== null) {
      emit(into, straightened, at);
      at += 1;
      continue;
    }

    const end = clusterEnd(text, at);
    const cluster = text.slice(at, end);
    emit(into, (end - at === 1 ? cluster : cluster.normalize("NFC")).toLowerCase(), at);
    at = end;
  }
  return finish(into, text.length);
}

/** A fragment folded the same way, with no map: it is only ever compared. */
export function foldedKey(text: string): string {
  return foldedForm(text).text;
}
