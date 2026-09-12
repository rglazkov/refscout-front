import { type PDFDocument, type PDFPage, type RGB } from "pdf-lib";

import { type Faces, type Run } from "./faces";
import { type Role } from "./files";
import { colour, column, leading, margin, page, size } from "./theme";

/**
 * The page as something text flows down.
 *
 * Everything above this file decides what the report says; this one knows where
 * on the paper it lands. It holds a cursor, opens a new sheet when the cursor
 * runs off the bottom, and breaks a paragraph into lines that fit the measure.
 *
 * It is written as a flow rather than as a set of positioned boxes because a
 * report has no fixed size: a finding may carry one place or forty, a quotation
 * may be a phrase or a paragraph, and a job may hold three documents or fifty.
 * Nothing here may depend on the length of what it is given, which is also why
 * a quotation is allowed to break across a page instead of being kept whole -
 * findings are never dropped in this product, and a layout that cannot split a
 * long one would eventually have to drop it.
 */

/** A stretch of text with one look. */
export type Span = {
  readonly text: string;
  readonly role?: Role;
  readonly size?: number;
  readonly color?: RGB;
};

export type Flow = {
  /** How far in from the left margin, in points. */
  readonly left?: number;
  /** How far short of the right margin to stop. */
  readonly right?: number;
  readonly leading?: number;
  /**
   * Called for each line after it is drawn, on the page it was drawn on. It is
   * what lets a quotation carry a rule down its left side: the rule is drawn
   * line by line, so the pieces meet across a page break instead of one long
   * line being drawn off the bottom of the first page.
   */
  readonly beside?: (line: { readonly top: number; readonly height: number }) => void;
};

/** One word, already cut into the faces that draw it. */
type Word = {
  readonly parts: readonly { readonly run: Run; readonly span: Span }[];
  readonly width: number;
};

/**
 * Where the baseline sits under the top of a line box. Taken as a fraction of
 * the size rather than from the face's own ascender: the four faces have
 * different ascenders, and lines that mix them - a number in the mono face
 * inside a sentence in the text face - have to sit on one baseline.
 */
const BASELINE = 0.78;

/** The corner of every panel and chip in the report, so they read as one set. */
const RADIUS = 4;

/** The coloured edge down the left of a finding, as wide as the screen's. */
const EDGE = 3;

export class Sheet {
  private sheet: PDFPage;
  /** The top of the next line box, in PDF coordinates, counted from the bottom. */
  private cursor: number;

  constructor(
    private readonly document: PDFDocument,
    private readonly faces: Faces,
  ) {
    this.sheet = document.addPage([page.width, page.height]);
    this.cursor = page.height - margin.top;
  }

  /** Where the measure starts, for the same few things. */
  get margin(): number {
    return margin.left;
  }

  /** The sheet being drawn on, for something that has to be placed on it later. */
  get here(): PDFPage {
    return this.sheet;
  }

  /** How many sheets there are so far, which is where the next thing lands. */
  get pageCount(): number {
    return this.document.getPageCount();
  }

  /** Starts the next sheet, whatever is left on this one. */
  turn(): void {
    this.sheet = this.document.addPage([page.width, page.height]);
    this.cursor = page.height - margin.top;
  }

  down(distance: number): void {
    this.cursor -= distance;
  }

  /**
   * Makes room for something that must not be split - a heading, or a heading
   * and the first line under it. A heading alone at the foot of a page is a
   * promise the page does not keep.
   */
  keep(height: number): void {
    if (this.cursor - height < margin.bottom) this.turn();
  }

  /** Where the next line would start, for placing something beside the flow. */
  get top(): number {
    return this.cursor;
  }

  /** How much room is left on this page below the cursor. */
  get room(): number {
    return this.cursor - margin.bottom;
  }

  /** The whole of a page, for deciding whether a block could ever fit on one. */
  get full(): number {
    return page.height - margin.top - margin.bottom;
  }

  /**
   * How tall a paragraph would be, worked out without drawing it.
   *
   * Wrapping depends on the measure and on nothing about where the paragraph
   * lands, so the answer is the same before and after a page turn. That is what
   * lets a finding be drawn as a panel: the height of everything inside it is
   * known before the first line goes down, so the panel can be drawn first and
   * the text over it.
   */
  measure(spans: readonly Span[], flow: Flow = {}): number {
    const step = flow.leading ?? leading.prose;
    return this.lines(spans, column - (flow.left ?? 0) - (flow.right ?? 0)).reduce(
      (total, line) => total + line.size * step,
      0,
    );
  }

  /**
   * A panel behind a block: a rounded rectangle across the measure, with a bar
   * of its own colour down the left edge.
   *
   * It is the card of the results screen on paper, and it is drawn the same way
   * for the same reason - the colour of the ground is what says how bad a
   * finding is, so the words inside it are free to be words. The bar is a
   * second rectangle rather than a thick border, because a border of that
   * weight all the way round would draw a box, and what is wanted is an edge.
   */
  panel(
    height: number,
    look: { readonly fill: RGB; readonly border: RGB; readonly edge: RGB },
    options: { readonly left?: number } = {},
  ): void {
    const x = margin.left + (options.left ?? 0);
    const width = column - (options.left ?? 0);
    this.rounded(x, this.cursor, width, height, look.edge, undefined, 0);
    this.rounded(
      x + EDGE,
      this.cursor,
      width - EDGE,
      height,
      look.fill,
      look.border,
      0.75,
    );
  }

  /** A plain rounded panel with no edge bar: the head of a document. */
  band(height: number, fill: RGB, border?: RGB): void {
    this.rounded(
      margin.left,
      this.cursor,
      column,
      height,
      fill,
      border,
      border === undefined ? 0 : 0.75,
    );
  }

  /** A small rounded ground for a chip, placed by the caller rather than flowed. */
  pill(
    x: number,
    width: number,
    height: number,
    look: { readonly fill: RGB; readonly border: RGB },
  ): void {
    this.rounded(x, this.cursor, width, height, look.fill, look.border, 0.75);
  }

  /** A panel inside a panel: the paper a quotation is set on. */
  inset(height: number, left: number, width: number, fill: RGB): void {
    this.rounded(margin.left + left, this.cursor, width, height, fill, undefined, 0);
  }

  /**
   * The ground under a single line, for a finding too long to be one panel.
   * Drawn before the line it stands under, so the words land on top of it, and
   * the pieces meet across a page break where one rectangle could not reach.
   */
  fillLine(
    line: { readonly top: number; readonly height: number },
    look: { readonly fill: RGB; readonly edge: RGB },
  ): void {
    this.sheet.drawRectangle({
      x: margin.left,
      y: line.top - line.height,
      width: column,
      height: line.height,
      color: look.fill,
    });
    this.sheet.drawRectangle({
      x: margin.left,
      y: line.top - line.height,
      width: EDGE,
      height: line.height,
      color: look.edge,
    });
  }

  /**
   * A rounded rectangle, drawn as a path.
   *
   * The corners are cubic curves rather than arcs on purpose: a path is placed
   * on the page through a transform that turns the y axis over, and an arc
   * carries a direction flag that turns over with it. Curves have no such flag,
   * so what is written here is what appears.
   */
  private rounded(
    x: number,
    top: number,
    width: number,
    height: number,
    fill: RGB,
    border: RGB | undefined,
    borderWidth: number,
  ): void {
    const r = Math.min(RADIUS, width / 2, height / 2);
    const k = r * 0.5523;
    const w = width;
    const h = height;
    const path =
      `M ${r} 0 L ${w - r} 0 C ${w - r + k} 0 ${w} ${r - k} ${w} ${r} ` +
      `L ${w} ${h - r} C ${w} ${h - r + k} ${w - r + k} ${h} ${w - r} ${h} ` +
      `L ${r} ${h} C ${r - k} ${h} 0 ${h - r + k} 0 ${h - r} ` +
      `L 0 ${r} C 0 ${r - k} ${r - k} 0 ${r} 0 Z`;
    this.sheet.drawSvgPath(path, {
      x,
      y: top,
      color: fill,
      ...(border === undefined ? {} : { borderColor: border, borderWidth }),
    });
  }

  /** How wide one line of spans is, for placing something beside it. */
  widthOf(spans: readonly Span[]): number {
    return spans.reduce(
      (total, span) =>
        total +
        this.faces
          .runs(span.text, span.role ?? "sans")
          .reduce(
            (sum, run) => sum + this.faces.width(run, span.size ?? size.finding),
            0,
          ),
      0,
    );
  }

  /**
   * One line of spans at a place of its own, outside the flow. It is for the
   * things a report has beside its text rather than in it - the label on a
   * chip, the two ends of a running foot - and it moves no cursor.
   */
  at(spans: readonly Span[], x: number, baseline: number, on?: PDFPage): void {
    let left = x;
    for (const span of spans) {
      for (const run of this.faces.runs(span.text, span.role ?? "sans")) {
        (on ?? this.sheet).drawText(run.text, {
          x: left,
          y: baseline,
          size: span.size ?? size.finding,
          font: this.faces.font(run.role),
          color: span.color ?? colour.text,
        });
        left += this.faces.width(run, span.size ?? size.finding);
      }
    }
  }

  /** A hairline across the measure, or across part of it. */
  rule(
    options: {
      readonly left?: number;
      readonly width?: number;
      readonly color?: RGB;
      readonly thickness?: number;
    } = {},
  ): void {
    const x = margin.left + (options.left ?? 0);
    this.sheet.drawLine({
      start: { x, y: this.cursor },
      end: { x: x + (options.width ?? column - (options.left ?? 0)), y: this.cursor },
      thickness: options.thickness ?? 0.5,
      color: options.color ?? colour.rule,
    });
  }

  /**
   * A paragraph, flowed into the measure and down the page for as long as it
   * takes. The spans are joined into one stream first, so a break happens where
   * the text has a space and not where one span ends and the next begins:
   * "Critical" in red followed by an em dash in grey is one line of prose, not
   * two words with a gap invented between them.
   */
  paragraph(spans: readonly Span[], flow: Flow = {}): void {
    const left = flow.left ?? 0;
    const measure = column - left - (flow.right ?? 0);
    const step = flow.leading ?? leading.prose;

    for (const line of this.lines(spans, measure)) {
      const height = line.size * step;
      if (this.cursor - height < margin.bottom) this.turn();
      flow.beside?.({ top: this.cursor, height });

      let x = margin.left + left;
      const baseline = this.cursor - line.size * BASELINE;
      for (const batch of this.batches(line)) {
        this.sheet.drawText(batch.run.text, {
          x,
          y: baseline,
          size: batch.size,
          font: this.faces.font(batch.run.role),
          color: batch.color,
        });
        x += batch.width;
      }
      this.cursor -= height;
    }
  }

  /**
   * One line's words gathered into as few drawings as the line allows: every
   * neighbouring stretch in the same face, size and colour becomes one string,
   * with the spaces between the words inside it.
   *
   * It is worth doing because it is the difference between a report that takes
   * a second and one that takes ten. A line of a finding is a word at a time to
   * everything above this point, and a drawing call per word over a job with
   * thousands of findings is a hundred thousand of them; a line is usually one
   * face throughout, so this turns almost all of that into one call apiece. The
   * text also comes out better set: a face kerns across the whole string it is
   * given, and it cannot kern between two strings drawn separately.
   */
  private batches(line: {
    readonly words: readonly Word[];
    readonly spaces: ReadonlyMap<Word, number>;
  }): readonly {
    readonly run: Run;
    readonly size: number;
    readonly color: RGB;
    readonly width: number;
  }[] {
    const batches: { run: Run; size: number; color: RGB; width: number }[] = [];

    /*
     * The width is added up from the pieces rather than measured off the joined
     * string. Measuring shapes the text, and every joined line is a string
     * nothing has measured before, so asking for its width would be one full
     * shaping per line - which is more than the drawing this exists to save.
     * The pieces have been measured already, by the very step that decided this
     * line held them.
     */
    const add = (text: string, role: Role, span: Span): void => {
      const at = span.size ?? size.finding;
      const paint = span.color ?? colour.text;
      const width = this.faces.width({ role, text }, at);
      const last = batches.at(-1);
      if (
        last !== undefined &&
        last.run.role === role &&
        last.size === at &&
        last.color === paint
      ) {
        last.run = { role, text: last.run.text + text };
        last.width += width;
        return;
      }
      batches.push({ run: { role, text }, size: at, color: paint, width });
    };

    for (const word of line.words) {
      for (const part of word.parts) add(part.run.text, part.run.role, part.span);
      if ((line.spaces.get(word) ?? 0) > 0) {
        const last = word.parts.at(-1);
        if (last !== undefined) add(" ", last.run.role, last.span);
      }
    }
    return batches;
  }

  /**
   * The spans, cut into words and packed greedily into lines no wider than the
   * measure. A word too long for a line of its own - a URL, an identifier, or a
   * language that does not put spaces between its words - is cut where it has
   * to be rather than being allowed to run off the page.
   */
  private lines(
    spans: readonly Span[],
    measure: number,
  ): readonly {
    readonly words: readonly Word[];
    readonly spaces: ReadonlyMap<Word, number>;
    readonly size: number;
  }[] {
    const stream = this.words(spans);
    const lines: {
      words: Word[];
      spaces: Map<Word, number>;
      size: number;
    }[] = [];
    let words: Word[] = [];
    let spaces = new Map<Word, number>();
    let width = 0;
    let tallest = 0;

    const close = (): void => {
      if (words.length > 0) lines.push({ words, spaces, size: tallest });
      words = [];
      spaces = new Map();
      width = 0;
      tallest = 0;
    };

    for (const entry of stream) {
      for (const piece of this.fit(entry.word, measure, width, words.length > 0)) {
        if (piece === "break") {
          close();
          continue;
        }
        words.push(piece);
        width += piece.width;
        tallest = Math.max(tallest, this.sizeOf(piece));
      }
      if (entry.space > 0 && words.length > 0) {
        const last = words.at(-1);
        if (last !== undefined) spaces.set(last, entry.space);
        width += entry.space;
      }
    }
    close();
    return lines;
  }

  /**
   * One word placed against what is already on the line: kept as it is if it
   * fits, moved to the next line if it does not, and cut into pieces if it
   * would not fit on a line of its own either.
   */
  private fit(
    word: Word,
    measure: number,
    used: number,
    started: boolean,
  ): readonly (Word | "break")[] {
    if (used + word.width <= measure) return [word];
    if (word.width <= measure) return started ? ["break", word] : [word];

    const pieces: (Word | "break")[] = started ? ["break"] : [];
    let room = measure;
    let parts: { run: Run; span: Span }[] = [];
    let width = 0;

    const flush = (): void => {
      if (parts.length > 0) pieces.push({ parts, width });
      parts = [];
      width = 0;
      room = measure;
    };

    for (const part of word.parts) {
      for (const character of part.run.text) {
        const run: Run = { role: part.run.role, text: character };
        const advance = this.faces.width(run, part.span.size ?? size.finding);
        if (width + advance > room && parts.length > 0) {
          flush();
          pieces.push("break");
        }
        const last = parts.at(-1);
        if (last !== undefined && last.run.role === run.role && last.span === part.span) {
          parts[parts.length - 1] = {
            run: { role: run.role, text: last.run.text + character },
            span: part.span,
          };
        } else {
          parts.push({ run, span: part.span });
        }
        width += advance;
      }
    }
    flush();
    return pieces;
  }

  /** Every word in the spans, with the space that follows each. */
  private words(
    spans: readonly Span[],
  ): readonly { readonly word: Word; readonly space: number }[] {
    const stream: { word: Word; space: number }[] = [];
    let parts: { run: Run; span: Span }[] = [];
    let width = 0;

    const close = (space: number): void => {
      if (parts.length === 0) {
        const last = stream.at(-1);
        if (last !== undefined && space > 0) last.space = Math.max(last.space, space);
        return;
      }
      stream.push({ word: { parts, width }, space });
      parts = [];
      width = 0;
    };

    for (const span of spans) {
      const chunks = span.text.split(/(\s+)/);
      for (const chunk of chunks) {
        if (chunk === "") continue;
        if (/^\s+$/.test(chunk)) {
          close(
            this.faces.width(
              { role: span.role ?? "sans", text: " " },
              span.size ?? size.finding,
            ),
          );
          continue;
        }
        for (const run of this.faces.runs(chunk, span.role ?? "sans")) {
          parts.push({ run, span });
          width += this.faces.width(run, span.size ?? size.finding);
        }
      }
    }
    close(0);
    return stream;
  }

  private sizeOf(word: Word): number {
    return word.parts.reduce(
      (tallest, part) => Math.max(tallest, part.span.size ?? size.finding),
      0,
    );
  }

  /**
   * The running head: what document this page belongs to, said on every page of
   * it.
   *
   * A report of fifty pages is read by turning to a page in the middle of it,
   * and the tinted head that names a document is four pages back by then. This
   * is the answer to "which manuscript am I looking at" wherever the reader
   * happens to be, and it costs a line of grey type above the text.
   *
   * The first page is left alone: the title of the report is on it, and naming
   * the document twice within an inch of the same corner is not clarity.
   */
  head(nameOf: (page: number) => string | null): void {
    const y = page.height - margin.top + 26;
    this.document.getPages().forEach((sheet, index) => {
      const name = index === 0 ? null : nameOf(index);
      if (name === null) return;
      const spans: readonly Span[] = [
        { text: this.clip(name, column), size: size.footer, color: colour.muted },
      ];
      this.at(spans, margin.left, y, sheet);
      sheet.drawLine({
        start: { x: margin.left, y: y - 8 },
        end: { x: margin.left + column, y: y - 8 },
        thickness: 0.5,
        color: colour.rule,
      });
    });
  }

  /**
   * The running foot, written last because it names the number of pages and
   * that is not known until there are no more. The title is cut to half the
   * measure if it is long: a foot that wraps is a foot that has become content.
   */
  foot(title: string, count: (current: number, total: number) => readonly Span[]): void {
    const pages = this.document.getPages();
    const y = margin.bottom - 26;

    pages.forEach((sheet, index) => {
      sheet.drawLine({
        start: { x: margin.left, y: y + 14 },
        end: { x: margin.left + column, y: y + 14 },
        thickness: 0.5,
        color: colour.rule,
      });

      const name: readonly Span[] = [
        { text: this.clip(title, column / 2), size: size.footer, color: colour.muted },
      ];
      this.at(name, margin.left, y, sheet);

      const numbers = count(index + 1, pages.length);
      this.at(numbers, margin.left + column - this.widthOf(numbers), y, sheet);
    });
  }

  /** A title cut to the width it is allowed, with an ellipsis where it was cut. */
  private clip(text: string, width: number): string {
    const fits = (candidate: string): boolean =>
      this.faces
        .runs(candidate, "sans")
        .reduce((sum, run) => sum + this.faces.width(run, size.footer), 0) <= width;
    if (fits(text)) return text;
    let kept = text;
    while (kept.length > 1 && !fits(`${kept}…`)) kept = kept.slice(0, -1);
    return `${kept}…`;
  }
}
