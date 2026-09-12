import fontkit from "@pdf-lib/fontkit";
import { type PDFDocument, type PDFFont } from "pdf-lib";

import { type Role } from "./files";

/**
 * The faces the report is set in, and the rule for which one draws which
 * character.
 *
 * Four roles, and each is the product's own face doing the job it does on the
 * screen: Inter for everything the product says, Inter's heavier weight for the
 * things it says loudly, Literata for a fragment quoted out of a manuscript -
 * the face a document is read in in the editor - and JetBrains Mono for every
 * number, because a quantity is set in the mono face wherever it appears here.
 *
 * A PDF carries its faces inside itself. There is no font stack to fall through
 * and no reader's system to borrow from, so the fallback a browser would do for
 * us is done here instead: a character is drawn by the first face of its role
 * that has a glyph for it, and Inter stands behind all four because it is the
 * one with the widest coverage. What none of them can draw becomes a visible
 * box - a reader who can see that a character did not come out is in a better
 * position than one looking at a gap where a word used to be.
 */
/** The file behind each role, as bytes. */
export type FaceBytes = Readonly<Record<Role, Uint8Array>>;

/**
 * Where each role turns when it cannot draw something. Inter last in every
 * chain, and nothing after it: the alternative to a box drawn once is a chain
 * that goes on asking faces that were never going to have the glyph.
 */
const CHAIN: Readonly<Record<Role, readonly Role[]>> = {
  sans: ["sans"],
  bold: ["bold", "sans"],
  serif: ["serif", "sans"],
  mono: ["mono", "sans"],
};

/** Stands in for a character no embedded face can draw. */
const MISSING = "□";

/**
 * Every rule that would draw two characters as one shape is switched off, and
 * the report is set as the characters it was given.
 *
 * That is the right answer here on its own merits. This report quotes other
 * people's manuscripts and prints their identifiers - a DOI, an address, a
 * bibliography key - and several of the checks are about the characters
 * themselves. A face that draws `://` as an arrow or `!=` as a crossed equals
 * is a face that shows the reader something their document does not contain.
 *
 * Both kinds also break the writer, in different ways, which is how they were
 * found. A ligature gets a wrong advance written into the file's own table of
 * widths, so "the effect" comes out as "the eff ect" inside a single drawn
 * string. And the contextual alternates of the mono face produce a glyph whose
 * metrics the writer cannot read at all: it throws while saving, and the person
 * who asked for a report gets no file.
 */
const AS_TYPED = { liga: false, clig: false, dlig: false, calt: false };

/** A piece of one line, set in one face. */
export type Run = { readonly role: Role; readonly text: string };

/**
 * Makes a face remember how it turned a string into glyphs.
 *
 * Turning text into the glyphs a PDF holds means shaping it, and the writer
 * does that once for every string it draws. The words of a report repeat
 * enormously - a check name, "line", "page", and the ordinary words of the
 * sentences quoted out of a manuscript - so over a long job most of that
 * shaping is the same work done again, and it is the single largest cost in
 * writing the file: without this a report of three thousand findings spends
 * most of its ten seconds here.
 *
 * The method is replaced rather than wrapped around because it is the writer
 * that calls it, from inside its own drawing, and there is no way to hand it a
 * different face. It is safe to replace: the same string always shapes to the
 * same glyphs, so what comes back from the memory is what the call would have
 * produced.
 */
function remember(font: PDFFont): PDFFont {
  const encoded = new Map<string, unknown>();
  const shape = font.encodeText.bind(font) as (text: string) => unknown;
  const memoised = font as unknown as { encodeText: (text: string) => unknown };
  memoised.encodeText = (text: string) => {
    const known = encoded.get(text);
    if (known !== undefined) return known;
    const glyphs = shape(text);
    encoded.set(text, glyphs);
    return glyphs;
  };
  return font;
}

export class Faces {
  /**
   * The faces go in whole, and the writer's own subsetting is deliberately off.
   *
   * Turning it on is the obvious saving and it must not be taken. The subsetter
   * that ships with the writer produces wrong outlines for these files as soon
   * as a page is drawn a string at a time, which is how every page here is
   * drawn - and it fails in the one way that gets past every test: the file
   * opens, the text inside it is correct, it searches and copies correctly, and
   * on the page half the letters are simply not there. Nothing about the data
   * says so; only looking at the rendered page does.
   *
   * Whole faces cost about half a megabyte in a report, because the file
   * compresses each of them as it embeds it. That is the price of the report
   * being legible, which is not a trade.
   */
  static async embed(document: PDFDocument, bytes: FaceBytes): Promise<Faces> {
    document.registerFontkit(fontkit);
    const roles: Role[] = ["sans", "bold", "serif", "mono"];
    const embedded = new Map<Role, PDFFont>();
    const parsed = new Map<Role, { hasGlyphForCodePoint: (code: number) => boolean }>();
    for (const role of roles) {
      embedded.set(
        role,
        remember(
          await document.embedFont(bytes[role], {
            subset: false,
            features: AS_TYPED,
          }),
        ),
      );
      /*
       * Read a second time, by us, for one question pdf-lib does not answer:
       * whether a face has a glyph for a character. It is the same bytes and it
       * is milliseconds, and the alternative is reaching inside the embedder
       * for a private field.
       */
      parsed.set(role, fontkit.create(bytes[role]));
    }
    return new Faces(embedded, parsed);
  }

  private readonly widths = new Map<string, number>();
  /**
   * Which face draws which part of a word, remembered for the same reason the
   * widths are: the words of a report repeat, and asking four faces about every
   * character of every one of them is work already done.
   */
  private readonly cut = new Map<string, readonly Run[]>();

  private constructor(
    private readonly embedded: ReadonlyMap<Role, PDFFont>,
    private readonly parsed: ReadonlyMap<
      Role,
      { hasGlyphForCodePoint: (code: number) => boolean }
    >,
  ) {}

  font(role: Role): PDFFont {
    const font = this.embedded.get(role);
    if (font === undefined) throw new Error(`the ${role} face was not embedded`);
    return font;
  }

  /**
   * One string cut into the faces that can draw it, in order. Characters that
   * stay in the same face stay in the same run, so a line of ordinary text is
   * one run and one drawing call however long it is.
   */
  runs(text: string, role: Role): readonly Run[] {
    const key = `${role} ${text}`;
    const known = this.cut.get(key);
    if (known !== undefined) return known;
    const runs: Run[] = [];
    let current: Role | null = null;
    let buffer = "";

    for (const character of text) {
      const code = character.codePointAt(0) ?? 0;
      const found = CHAIN[role].find((candidate) =>
        this.parsed.get(candidate)?.hasGlyphForCodePoint(code),
      );
      const drawn = found ?? role;
      const glyph = found === undefined ? MISSING : character;
      if (drawn !== current) {
        if (current !== null) runs.push({ role: current, text: buffer });
        current = drawn;
        buffer = "";
      }
      buffer += glyph;
    }

    if (current !== null) runs.push({ role: current, text: buffer });
    this.cut.set(key, runs);
    return runs;
  }

  /**
   * How wide a run is, remembered.
   *
   * Measuring shapes the text, and laying out a report means measuring the same
   * words over and over - the word "line" appears once per place in a document
   * that may hold thousands. Without this a long job spends most of its time
   * shaping words it has already shaped.
   */
  width(run: Run, size: number): number {
    const key = `${run.role} ${size} ${run.text}`;
    const known = this.widths.get(key);
    if (known !== undefined) return known;
    const measured = this.font(run.role).widthOfTextAtSize(run.text, size);
    this.widths.set(key, measured);
    return measured;
  }
}
