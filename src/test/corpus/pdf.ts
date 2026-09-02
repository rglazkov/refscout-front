import { createHash } from "node:crypto";

/**
 * PDFs written by hand, for the corpus. Every fixture here is built from bytes
 * in this file, which is what keeps the rule against real documents easy to
 * hold: there is not one document of anybody's in the repository, and there is
 * nothing to be careless with. A published paper under a free licence would do as well; a
 * manuscript somebody sent us would not, and the way to make sure that never
 * happens by accident is to have no place to put one.
 *
 * They are deliberately small and deliberately odd - a broken cross-reference
 * table, a font with no glyphs, forty characters of Chinese - because what is
 * being tested is our handling of the awkward cases rather than pdf.js's
 * handling of the ordinary one.
 */
type PdfObject = string;

/** The 32-byte pad from the standard security handler (PDF 1.7, algorithm 2). */
const PAD = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa,
  0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe,
  0x64, 0x53, 0x69, 0x7a,
]);

export type PdfPage = {
  /** Content-stream operators for the page body. */
  readonly content: string;
};

export type PdfOptions = {
  readonly info?: Readonly<Record<string, string>>;
  /** Extra objects, appended after the pages; referenced by number. */
  readonly extra?: readonly PdfObject[];
  /** The resource dictionary each page carries. */
  readonly resources?: string;
  /** Encrypt with the standard handler, revision 2 (RC4, 40 bits). */
  readonly password?: string;
  /** Point `startxref` at nothing, which is the damaged file the table names. */
  readonly breakXref?: boolean;
};

/**
 * The writer. Objects are laid out in order, the cross-reference table is
 * computed from where they landed, and nothing here is clever: a fixture whose
 * generator needs debugging is a fixture that proves nothing.
 */
export function buildPdf(
  pages: readonly PdfPage[],
  options: PdfOptions = {},
): Uint8Array {
  const objects: PdfObject[] = [];
  const add = (body: PdfObject): number => objects.push(body);

  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("PAGES");

  const resources = options.resources ?? "<< /Font << /F1 3 0 R >> >>";
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  // Extras go in before the pages so that their numbers are fixed at 4 and up
  // whatever the document holds. A fixture that has to count its own objects is
  // a fixture that breaks the next time one is added.
  for (const body of options.extra ?? []) add(body);

  const kids: number[] = [];
  for (const page of pages) {
    const stream = add(
      `<< /Length ${page.content.length} >>\nstream\n${page.content}\nendstream`,
    );
    kids.push(
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources ${resources} /Contents ${stream} 0 R >>`,
      ),
    );
  }
  objects[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids
    .map((kid) => `${kid} 0 R`)
    .join(" ")}] >>`;

  const infoNumber =
    options.info === undefined
      ? null
      : add(
          `<< ${Object.entries(options.info)
            .map(([key, value]) => `/${key} (${escapeString(value)})`)
            .join(" ")} >>`,
        );

  const id = "0123456789abcdef0123456789abcdef";
  const encryption =
    options.password === undefined ? null : standardSecurity(options.password, id);
  const encryptNumber =
    encryption === null
      ? null
      : add(
          `<< /Filter /Standard /V 1 /R 2 /Length 40 /P -1 ` +
            `/O <${hex(encryption.owner)}> /U <${hex(encryption.user)}> >>`,
        );

  const trailer =
    `<< /Size ${objects.length + 1} /Root 1 0 R ` +
    (infoNumber === null ? "" : `/Info ${infoNumber} 0 R `) +
    (encryptNumber === null ? "" : `/Encrypt ${encryptNumber} 0 R `) +
    `/ID [<${id}> <${id}>] >>`;

  return assemble(objects, trailer, {
    ...(encryption === null
      ? {}
      : { key: encryption.key, skip: new Set([encryptNumber ?? 0]) }),
    breakXref: options.breakXref ?? false,
  });
}

function assemble(
  objects: readonly PdfObject[],
  trailer: string,
  options: {
    readonly key?: Uint8Array;
    readonly skip?: ReadonlySet<number>;
    readonly breakXref: boolean;
  },
): Uint8Array {
  let out = "%PDF-1.7\n";
  const offsets: number[] = [];

  objects.forEach((body, index) => {
    offsets.push(out.length);
    const number = index + 1;
    const encrypted =
      options.key === undefined || options.skip?.has(number) === true
        ? body
        : encryptObject(body, number, options.key);
    out += `${number} 0 obj\n${encrypted}\nendobj\n`;
  });

  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  // A file whose table points into empty space. pdf.js recovers such a document
  // by scanning it, which is the behaviour the corpus is here to pin down.
  out += `trailer\n${trailer}\nstartxref\n${options.breakXref ? 999_999 : xref}\n%%EOF\n`;

  return latin1(out);
}

/**
 * Only the content streams carry text worth hiding, and they are the only
 * strings these fixtures have, so the object encryption below covers exactly
 * the case the corpus needs: a protected document that pdf.js has to be given a
 * password to read.
 */
function encryptObject(body: string, number: number, key: Uint8Array): string {
  const start = body.indexOf("stream\n");
  if (start === -1) return body;
  const from = start + "stream\n".length;
  const to = body.lastIndexOf("\nendstream");
  const clear = body.slice(from, to);
  const cipher = rc4(objectKey(key, number), latin1(clear));
  const encrypted = String.fromCharCode(...cipher);
  return `<< /Length ${encrypted.length} >>\nstream\n${encrypted}\nendstream`;
}

/** Algorithms 2, 3 and 4 of the standard security handler, at revision 2. */
function standardSecurity(
  password: string,
  id: string,
): { key: Uint8Array; owner: Uint8Array; user: Uint8Array } {
  const padded = pad(password);
  // The owner entry, from the owner password - which here is the same one.
  const ownerKey = md5(padded).slice(0, 5);
  const owner = rc4(ownerKey, padded);

  const permissions = new Uint8Array(4);
  new DataView(permissions.buffer).setInt32(0, -1, true);
  const key = md5(concat(padded, owner, permissions, fromHex(id))).slice(0, 5);
  const user = rc4(key, PAD);

  return { key, owner, user };
}

function objectKey(key: Uint8Array, number: number): Uint8Array {
  const suffix = Uint8Array.from([
    number & 0xff,
    (number >> 8) & 0xff,
    (number >> 16) & 0xff,
    0,
    0,
  ]);
  return md5(concat(key, suffix)).slice(0, Math.min(key.length + 5, 16));
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const state = new Uint8Array(256);
  for (let index = 0; index < 256; index += 1) state[index] = index;
  let swap = 0;
  for (let index = 0; index < 256; index += 1) {
    swap = (swap + (state[index] ?? 0) + (key[index % key.length] ?? 0)) & 0xff;
    [state[index], state[swap]] = [state[swap] ?? 0, state[index] ?? 0];
  }
  const out = new Uint8Array(data.length);
  let i = 0;
  let j = 0;
  for (let at = 0; at < data.length; at += 1) {
    i = (i + 1) & 0xff;
    j = (j + (state[i] ?? 0)) & 0xff;
    [state[i], state[j]] = [state[j] ?? 0, state[i] ?? 0];
    out[at] = (data[at] ?? 0) ^ (state[((state[i] ?? 0) + (state[j] ?? 0)) & 0xff] ?? 0);
  }
  return out;
}

function pad(password: string): Uint8Array {
  const bytes = latin1(password).slice(0, 32);
  return concat(bytes, PAD.slice(0, 32 - bytes.length));
}

function md5(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("md5").update(bytes).digest());
}

function concat(...parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1)
    out[index] = text.charCodeAt(index) & 0xff;
  return out;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(text: string): Uint8Array {
  const out = new Uint8Array(text.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(text.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function escapeString(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

/** A page of ordinary prose, one line per string. */
export function textPage(lines: readonly string[]): PdfPage {
  const body = lines
    .map((line, index) => `1 0 0 1 72 ${720 - index * 16} Tm (${escapeString(line)}) Tj`)
    .join("\n");
  return { content: `BT /F1 12 Tf\n${body}\nET` };
}

/**
 * Two columns on one page. It is here because a two-column paper is the most
 * common scientific layout and the one where extraction most often produces
 * interleaved nonsense - so the invariant it is checked against is that both
 * columns are present, not that they are in any particular order.
 */
export function twoColumnPage(
  left: readonly string[],
  right: readonly string[],
): PdfPage {
  const column = (lines: readonly string[], x: number): string =>
    lines
      .map(
        (line, index) => `1 0 0 1 ${x} ${720 - index * 16} Tm (${escapeString(line)}) Tj`,
      )
      .join("\n");
  return {
    content: `BT /F1 10 Tf\n${column(left, 60)}\n${column(right, 320)}\nET`,
  };
}

/**
 * A page with a picture on it and no text at all - what a scanned thesis looks
 * like from the inside. The image is one grey pixel, because the fixture is
 * about the absence of a text layer rather than about the picture.
 */
export function scanPage(): PdfPage {
  return { content: "q 612 0 0 792 0 0 cm /Im0 Do Q" };
}

export const scanResources = "<< /XObject << /Im0 4 0 R >> >>";

/**
 * A font with no glyph data and a `ToUnicode` map, which is how a PDF says what
 * its characters mean when the glyphs are its own. It gives the corpus
 * ligatures, mathematics and diacritics without a font file in the repository.
 */
export function unicodeFontObjects(characters: readonly string[]): {
  readonly objects: readonly string[];
  readonly resources: string;
  readonly page: (indices: readonly number[]) => PdfPage;
} {
  const mappings = characters
    .map((character, index) => {
      const units = Array.from({ length: character.length }, (_, at) =>
        character.charCodeAt(at).toString(16).padStart(4, "0"),
      ).join("");
      return `<${(index + 1).toString(16).padStart(4, "0")}> <${units}>`;
    })
    .join("\n");

  const cmap =
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n" +
    "1 begincodespacerange <0000> <FFFF> endcodespacerange\n" +
    `${characters.length} beginbfchar\n${mappings}\nendbfchar\n` +
    "endcmap CMapName currentdict /CMap defineresource pop end end";

  return {
    // Numbered from four, which is where `buildPdf` puts the extras.
    objects: [
      "<< /Type /Font /Subtype /Type0 /BaseFont /Corpus /Encoding /Identity-H " +
        "/DescendantFonts [5 0 R] /ToUnicode 6 0 R >>",
      "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Corpus /DW 1000 " +
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
        "/FontDescriptor 7 0 R /CIDToGIDMap /Identity >>",
      `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`,
      "<< /Type /FontDescriptor /FontName /Corpus /Flags 4 " +
        "/FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 " +
        "/CapHeight 700 /StemV 80 >>",
    ],
    resources: "<< /Font << /F1 4 0 R >> >>",
    page: (indices) => ({
      content: `BT /F1 12 Tf 1 0 0 1 72 720 Tm <${indices
        .map((index) => (index + 1).toString(16).padStart(4, "0"))
        .join("")}> Tj ET`,
    }),
  };
}

/**
 * A page of Chinese, encoded the way a document produced in China is: a font
 * with no glyphs of its own, a predefined character map by name, and two-byte
 * codes in the content stream. It is the fixture behind the character-map
 * check - pdf.js can only read it if the `cmaps/` folder has been copied
 * beside the build, and
 * without them it extracts as an empty string, which our own heuristics then
 * report as "this document is a scan". A perfectly good file, refused.
 */
export function cjkFontObjects(text: string): {
  readonly objects: readonly string[];
  readonly resources: string;
  readonly page: PdfPage;
} {
  const codes = Array.from({ length: text.length }, (_, at) =>
    text.charCodeAt(at).toString(16).padStart(4, "0"),
  ).join("");

  return {
    objects: [
      "<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H " +
        "/DescendantFonts [5 0 R] >>",
      "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /DW 1000 " +
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> " +
        "/FontDescriptor 6 0 R >>",
      "<< /Type /FontDescriptor /FontName /STSong-Light /Flags 4 " +
        "/FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 " +
        "/CapHeight 700 /StemV 80 >>",
    ],
    resources: "<< /Font << /F1 4 0 R >> >>",
    page: { content: `BT /F1 12 Tf 1 0 0 1 72 720 Tm <${codes}> Tj ET` },
  };
}
