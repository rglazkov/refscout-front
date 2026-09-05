/**
 * The two units a position in a text is counted in, told apart by the compiler.
 *
 * Between a module's answer and a highlighted fragment an offset changes
 * coordinate system twice, and both changes are places where a number quietly
 * becomes the wrong number. On the wire everything is counted in Unicode code
 * points, because that is the unit the server counts in and the one a limit is
 * expressed in. In the browser a string is a sequence of UTF-16 units, and that
 * is what the editor, the page map and every map built while a document was
 * read are counted in.
 *
 * On an English manuscript the two are the same number, which is why mixing
 * them survives every test written on the texts a developer has to hand and
 * fails on the first thesis with a formula or an emoji in it. So they are given
 * different types. Nothing is checked at run time and nothing is allocated: the
 * brand exists only while the code is being compiled, and what it buys is that
 * a code-point offset handed to something expecting a live-text one stops the
 * build instead of moving a highlight by a character per emoji above it.
 */

/** Counted in Unicode code points: what arrives from a module, and what is sent. */
export type CpOffset = number & { readonly __unit: "cp" };

/** Counted in UTF-16 units: the browser's own coordinates, and the editor's. */
export type DocOffset = number & { readonly __unit: "utf16" };

/**
 * A plain number that is already known to be in this unit, given its type. The
 * argument is deliberately not "any number": a value that already carries the
 * other unit is rejected, so the only way from one unit to the other is the
 * conversion that knows how, and these two cannot be used to launder a number
 * past it.
 */
type Unbranded<T extends number> = T extends { readonly __unit: string } ? never : T;

export function asCpOffset<T extends number>(value: Unbranded<T>): CpOffset {
  return value as unknown as CpOffset;
}

export function asDocOffset<T extends number>(value: Unbranded<T>): DocOffset {
  return value as unknown as DocOffset;
}
