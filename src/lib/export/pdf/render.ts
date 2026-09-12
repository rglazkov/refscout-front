import { type Severity } from "@/lib/domain";

import {
  type ReportCheck,
  type ReportDoc,
  type ReportFinding,
  type ReportPlace,
  type ReportSection,
} from "../report";
import { type PdfWording } from "./files";
import { type Bookmark } from "./outline";
import { type Sheet, type Span } from "./sheet";
import { colour, column, gap, leading, pad, severity, size } from "./theme";

/**
 * The report, put on the page.
 *
 * The order the eye takes things in is the design here, and it is deliberate:
 * the name of the document first, the name of the check second, the finding
 * third. Each is a step down in size and a step up in ink - a document opens
 * its page with a tinted head carrying the largest words on it, a check is a
 * heading with a rule under it, and a finding is a card on a ground the colour
 * of its severity, which is how the screen draws one too.
 *
 * That is also why the severity is not shouted in the text. Coloured words were
 * once the only colour on the page, and they were the only thing anyone saw: a
 * list of red and amber phrases with the name of the document lost in black
 * somewhere above them. The colour belongs under a finding rather than in it.
 *
 * Every document starts a page of its own. A report is worked through one
 * manuscript at a time - the person has that file open beside it - and a
 * section that begins four lines above a page break is one that has to be
 * hunted for.
 */

/** Where the text of a finding stands inside its own panel. */
const INSIDE = { left: pad.panel + 3, right: pad.panel } as const;

/** The chip of one severity at the head of a document. */
const CHIP = { height: 16, pad: 7, gap: 6 } as const;

type Look = (typeof severity)[Severity];

export function drawReport(
  sheet: Sheet,
  doc: ReportDoc,
  wording: PdfWording,
): readonly Bookmark[] {
  sheet.paragraph([{ text: doc.title, role: "bold", size: size.title }]);
  sheet.down(5);
  sheet.paragraph([{ text: doc.generatedAt, size: size.produced, color: colour.muted }]);
  sheet.down(gap.afterTitle);

  /*
   * Over one document the contents would be a list of one, so the first page
   * carries the title and that document together. Over several it is worth a
   * page: it is the only place in the report where they are all seen at once,
   * and it is what a reader looks at to decide where to start.
   */
  const contents = doc.documents.length > 1 ? drawContents(sheet, doc, wording) : [];

  const marks: Bookmark[] = [];
  /** Which document each page belongs to, for the running head. */
  const owners: { readonly from: number; readonly name: string }[] = [];

  doc.documents.forEach((document, index) => {
    if (index > 0 || contents.length > 0) sheet.turn();
    const from = sheet.pageCount - 1;
    owners.push({ from, name: document.name });
    contents[index]?.fill(from + 1);
    marks.push({
      title: document.name,
      page: from,
      children: drawDocument(sheet, document, wording),
    });
  });

  sheet.head((index) => {
    const owner = owners.filter((entry) => entry.from <= index).at(-1);
    if (owner === undefined) return null;
    // Not on the page the document opens, where its name is already the largest
    // thing on the paper. The running head is for the pages after that one.
    return owner.from === index ? null : owner.name;
  });
  sheet.foot(doc.title, (current, total) =>
    fill(wording.pageNumbers, { page: String(current), total: String(total) }),
  );
  return marks;
}

/**
 * The documents of the report on one page, with what was found in each and the
 * page it starts on.
 *
 * The page numbers are not known while this is drawn - the documents it names
 * have not been laid out yet - so each row hands back a way to write its own
 * number once that page exists. It is the same arrangement the running foot
 * lives by, and it is the only one available to a report that is written from
 * the top down.
 */
function drawContents(
  sheet: Sheet,
  doc: ReportDoc,
  wording: PdfWording,
): readonly { readonly fill: (page: number) => void }[] {
  const rows: { fill: (page: number) => void }[] = [];

  for (const document of doc.documents) {
    const name: Span[] = [{ text: document.name, role: "bold", size: size.contents }];
    const counts = countSpans(document, wording, size.counts);
    sheet.keep(size.contents * 3);

    const on = sheet.here;
    const baseline = sheet.top - size.contents * 0.78;
    sheet.paragraph(name, { right: 40 });
    if (counts.length > 0) {
      sheet.down(2);
      sheet.paragraph(counts, { left: 0, right: 40 });
    }
    sheet.down(gap.betweenContents);
    sheet.rule({ color: colour.rule });
    sheet.down(gap.betweenContents);

    rows.push({
      fill: (page) => {
        const number: Span[] = [
          { text: String(page), role: "mono", size: size.contents, color: colour.muted },
        ];
        sheet.at(number, sheet.margin + column - sheet.widthOf(number), baseline, on);
      },
    });
  }
  return rows;
}

/** The counts of a document said in a line, for the contents page. */
function countSpans(
  document: ReportSection,
  wording: PdfWording,
  at: number,
): readonly Span[] {
  const spans: Span[] = [];
  for (const kind of ["critical", "warning", "info"] as const) {
    const found = document.counts[kind];
    if (found === 0) continue;
    if (spans.length > 0) spans.push({ text: "   ", size: at });
    spans.push(
      { text: "●", size: at * 0.7, color: severity[kind].edge },
      { text: ` ${String(found)}`, role: "mono", size: at },
      { text: ` ${wording.severity[kind]}`, size: at, color: colour.muted },
    );
  }
  return spans;
}

/**
 * The head of a document: its name, and what was found in it, on a tinted
 * ground that runs the width of the page.
 *
 * This is what the reader is meant to see first when the page turns, and it is
 * the only place in the report where the accent colour fills anything. The
 * counts sit inside it as the same chips the screen shows, so "three critical"
 * is read as a quantity at a glance instead of being parsed out of a sentence.
 */
function drawDocument(
  sheet: Sheet,
  document: ReportSection,
  wording: PdfWording,
): readonly Bookmark[] {
  const name: Span[] = [{ text: document.name, role: "bold", size: size.document }];
  const chips = countChips(document, wording);
  const height =
    pad.panel +
    sheet.measure(name, { left: pad.panel, right: pad.panel }) +
    (chips.length === 0 ? 0 : 8 + CHIP.height) +
    pad.panel;

  sheet.keep(height + size.check * 4);
  sheet.band(height, colour.accentSoft);
  sheet.down(pad.panel);
  sheet.paragraph(name, { left: pad.panel, right: pad.panel });
  if (chips.length > 0) {
    sheet.down(8);
    drawChips(sheet, chips);
  }
  sheet.down(pad.panel + gap.afterDocument);

  for (const note of document.notes) {
    sheet.paragraph([{ text: note, size: size.detail, color: colour.muted }]);
    sheet.down(gap.afterDocument);
  }

  if (document.nothing !== null) {
    sheet.paragraph([{ text: document.nothing, size: size.finding }]);
    return [];
  }

  return document.checks.map((check, index) => {
    if (index > 0) sheet.down(gap.beforeCheck);
    return { title: check.name, page: drawCheck(sheet, check) };
  });
}

function countChips(
  document: ReportSection,
  wording: PdfWording,
): readonly { readonly spans: readonly Span[]; readonly look: Severity }[] {
  const chips: { spans: readonly Span[]; look: Severity }[] = [];
  for (const kind of ["critical", "warning", "info"] as const) {
    const found = document.counts[kind];
    // A severity with nothing in it is left out rather than printed as a zero:
    // the head is a summary, and "0 critical" is not news to anybody.
    if (found === 0) continue;
    chips.push({
      look: kind,
      spans: [
        {
          text: String(found),
          role: "mono",
          size: size.counts,
          color: severity[kind].edge,
        },
        { text: ` ${wording.severity[kind]}`, size: size.counts, color: colour.text },
      ],
    });
  }
  return chips;
}

function drawChips(
  sheet: Sheet,
  chips: readonly { readonly spans: readonly Span[]; readonly look: Severity }[],
): void {
  let x = sheet.margin + pad.panel;
  for (const chip of chips) {
    const width = sheet.widthOf(chip.spans) + CHIP.pad * 2;
    sheet.pill(x, width, CHIP.height, severity[chip.look]);
    sheet.at(chip.spans, x + CHIP.pad, sheet.top - CHIP.height + 5.5);
    x += width + CHIP.gap;
  }
  sheet.down(CHIP.height);
}

/**
 * The name of a check, with a rule under it that runs the whole measure. It is
 * a heading and it is drawn as one: the space above it is three times the space
 * between the findings under it, so those read as its contents rather than as a
 * list that happens to follow it.
 */
function drawCheck(sheet: Sheet, check: ReportCheck): number {
  const name: Span[] = [{ text: check.name, role: "bold", size: size.check }];
  /*
   * The heading and the first finding under it travel together, and how much
   * room that needs is measured rather than guessed. A guess is wrong in both
   * directions: too little leaves a heading alone at the foot of a page, and
   * too much sends a heading to the next page with a hand's width of paper
   * still empty under it.
   */
  const note: Span[] =
    check.note === null
      ? []
      : [{ text: check.note, size: size.detail, color: colour.muted }];
  const first = check.findings[0];
  sheet.keep(
    sheet.measure(name) +
      gap.afterCheckName +
      gap.afterCheckRule +
      (note.length === 0 ? 0 : sheet.measure(note) + gap.betweenFindings) +
      (first === undefined ? 0 : Math.min(measured(sheet, first).height, sheet.full / 2)),
  );
  sheet.paragraph(name);
  // Where the index will point, taken here: the reservation above is what may
  // have turned the page, and the line in the sidebar has to point at the page
  // the heading is actually on.
  const at = sheet.pageCount - 1;
  sheet.down(gap.afterCheckName);
  sheet.rule({ color: colour.accent, thickness: 1 });
  sheet.down(gap.afterCheckRule);

  if (note.length > 0) {
    sheet.paragraph(note);
    sheet.down(gap.betweenFindings);
  }

  check.findings.forEach((finding, index) => {
    if (index > 0) sheet.down(gap.betweenFindings);
    drawFinding(sheet, finding);
  });
  return at;
}

/** Draws the ground under one line, where a finding is too tall for a panel. */
type Band = (line: { readonly top: number; readonly height: number }) => void;

/** One piece of a finding: how tall it is, and how to draw it. */
type Piece = { readonly height: number; readonly draw: (band?: Band) => void };

/** A finding laid out but not yet drawn: its pieces, and what they come to. */
function measured(
  sheet: Sheet,
  finding: ReportFinding,
): { readonly pieces: readonly Piece[]; readonly height: number } {
  const pieces = piecesOf(sheet, finding, severity[finding.severity]);
  return {
    pieces,
    height: pieces.reduce((total, piece) => total + piece.height, 0) + pad.panel * 2,
  };
}

/**
 * A finding, as a card on a ground the colour of its severity.
 *
 * It is measured before anything is drawn, because the panel has to go down
 * before the words that stand on it. A finding longer than a page - forty
 * places, or a quotation the length of a paragraph - cannot be one panel at
 * all, and takes the same colours as a band drawn line by line instead: the
 * ground still says what the finding is, and the text is free to break where it
 * must. Findings are never dropped in this product, so the layout has to hold
 * the long one rather than the layout deciding what fits.
 */
function drawFinding(sheet: Sheet, finding: ReportFinding): void {
  const look = severity[finding.severity];
  const { pieces, height } = measured(sheet, finding);

  if (height > sheet.room) sheet.keep(Math.min(height, sheet.full));

  if (height <= sheet.room) {
    sheet.panel(height, look);
    sheet.down(pad.panel);
    for (const piece of pieces) piece.draw();
    sheet.down(pad.panel);
    return;
  }

  const band: Band = (line) => {
    sheet.fillLine(line, look);
  };
  for (const piece of pieces) piece.draw(band);
}

function piecesOf(sheet: Sheet, finding: ReportFinding, look: Look): readonly Piece[] {
  const pieces: Piece[] = [];

  /*
   * The severity is still named in words at the head of a finding, small and in
   * capitals the way a badge is set. The ground says it in colour already; this
   * is for the reader who prints in grey, and for the one who is not going to
   * learn what amber means from a page.
   */
  const head: Span[] = [
    {
      text: finding.severityLabel.toUpperCase(),
      role: "bold",
      size: size.badge,
      color: look.edge,
    },
    { text: "   ", size: size.finding },
    { text: finding.title, size: size.finding },
  ];
  if (finding.mark !== null) {
    head.push({ text: `  (${finding.mark})`, size: size.place, color: colour.muted });
  }
  pieces.push(run(sheet, head, gap.afterFindingTitle));

  for (const place of finding.places) pieces.push(...placePieces(sheet, place));

  if (finding.detail !== null) {
    pieces.push(
      run(
        sheet,
        [{ text: finding.detail, size: size.detail }],
        finding.facts.length > 0 || finding.replacement !== null ? gap.beforeDetail : 0,
      ),
    );
  }

  /*
   * The typed facts the module answered with - a DOI, an address, a date, a
   * count, a named source. They are on the card on the screen for a reason, and
   * the reason holds on paper: a finding read without them is a title and a line
   * number. The value is the part that gets compared or copied, so it is set in
   * the mono face and the label in front of it is not.
   */
  finding.facts.forEach((fact, index) => {
    const spans: Span[] = [];
    if (fact.label !== null) {
      spans.push({ text: `${fact.label} `, size: size.evidence, color: colour.muted });
    }
    spans.push({ text: fact.value, role: "mono", size: size.evidence });
    const last = index === finding.facts.length - 1;
    pieces.push(
      run(sheet, spans, last && finding.replacement !== null ? gap.beforeDetail : 2),
    );
  });

  if (finding.replacement !== null) {
    pieces.push(
      run(
        sheet,
        [{ text: finding.replacement.label, size: size.place, color: colour.muted }],
        gap.aroundQuote,
      ),
    );
    pieces.push(quote(sheet, finding.replacement.text));
  }

  return pieces;
}

/** Where a finding is, and the fragment the module was reading there. */
function placePieces(sheet: Sheet, place: ReportPlace): readonly Piece[] {
  const pieces: Piece[] = [];

  if (place.where.length > 0) {
    const spans: Span[] = [];
    for (const where of place.where) {
      if (spans.length > 0) {
        spans.push({ text: "  ·  ", size: size.place, color: colour.muted });
      }
      spans.push({ text: where.label, size: size.place, color: colour.muted });
      if (where.value !== null) {
        spans.push({ text: ` ${where.value}`, role: "mono", size: size.place });
      }
    }
    pieces.push(
      run(
        sheet,
        spans,
        place.quote === null && place.bibkey === null ? 0 : gap.aroundQuote,
      ),
    );
  }

  /*
   * The entry of a bibliography is an identifier and is set as one, in the mono
   * face and on the line, rather than as a quotation on paper of its own: what
   * the reader does with a key is search their file for it.
   */
  if (place.bibkey !== null) {
    pieces.push(run(sheet, [{ text: place.bibkey, role: "mono", size: size.place }], 2));
  }

  if (place.quote !== null) pieces.push(quote(sheet, place.quote));
  return pieces;
}

/**
 * Somebody else's words, set in the reading face on paper of their own.
 *
 * The inset is white against the tinted card for the same reason the face is a
 * serif: what is inside it is not ours. It also makes the fragment the second
 * thing seen on the card after the title, which is right - the sentence out of
 * the manuscript is what the reader will look for the moment they open their
 * own document.
 */
function quote(sheet: Sheet, text: string): Piece {
  const spans: Span[] = [{ text, role: "serif", size: size.quote }];
  const flow = {
    left: INSIDE.left + pad.quote,
    right: INSIDE.right + pad.quote,
    leading: leading.quote,
  } as const;
  const height = sheet.measure(spans, flow) + 12;

  return {
    height: height + gap.aroundQuote,
    draw: (band) => {
      /*
       * Only where the finding is a panel. In the banded case the ground is
       * drawn a line at a time, and paper of its own under a quotation that
       * runs over a page break would be one tall rectangle hanging off the
       * bottom of the page - so the quotation there is simply set on the same
       * ground as the rest, and keeps its face and its air.
       */
      if (band === undefined) {
        sheet.inset(
          height,
          INSIDE.left,
          column - INSIDE.left - INSIDE.right,
          colour.paper,
        );
      }
      sheet.down(6);
      sheet.paragraph(spans, band === undefined ? flow : { ...flow, beside: band });
      sheet.down(6 + gap.aroundQuote);
    },
  };
}

/** A run of text inside a finding, measured now and drawn later. */
function run(sheet: Sheet, spans: readonly Span[], after: number): Piece {
  return {
    height: sheet.measure(spans, INSIDE) + after,
    draw: (band) => {
      sheet.paragraph(spans, band === undefined ? INSIDE : { ...INSIDE, beside: band });
      sheet.down(after);
    },
  };
}

/**
 * A worded sentence with numbers in it, cut into spans so that the numbers come
 * out in the mono face and the words around them do not. The placeholders are
 * the dictionary's own, and where a language puts them is where they are drawn.
 */
function fill(text: string, values: Readonly<Record<string, string>>): readonly Span[] {
  const spans: Span[] = [];
  for (const piece of text.split(/(\{[a-zA-Z]+\})/)) {
    if (piece === "") continue;
    const name = piece.startsWith("{") ? piece.slice(1, -1) : null;
    const value = name === null ? undefined : values[name];
    if (value === undefined) {
      spans.push({ text: piece, size: size.footer, color: colour.muted });
    } else {
      spans.push({ text: value, role: "mono", size: size.footer, color: colour.muted });
    }
  }
  return spans;
}
