import { zipSync } from "fflate";

/**
 * Word files written by hand, for the corpus. Like the PDFs beside them they
 * are entirely synthetic, so the repository holds nobody's manuscript.
 *
 * A `.docx` is a zip of XML parts, and the parts these fixtures carry are
 * exactly the ones the container reader lets through: the document, its
 * relationships, its styles, its numbering and its footnotes.
 */
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>
</Relationships>`;

/**
 * A journal template's stylesheet: the paragraph styles a submission arrives
 * with, named the way a template names them rather than the way Word does.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
  <w:style w:type="paragraph" w:styleId="JournalTitle"><w:name w:val="heading 1"/></w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>
</w:styles>`;

const NUMBERING = `<?xml version="1.0" encoding="UTF-8"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

const FOOTNOTES = `<?xml version="1.0" encoding="UTF-8"?>
<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:footnote w:id="1">
    <w:p><w:r><w:t>The footnote that proves footnotes survive.</w:t></w:r></w:p>
  </w:footnote>
</w:footnotes>`;

export function paragraph(text: string, style?: string): string {
  const properties =
    style === undefined ? "" : `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`;
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function bullet(text: string, level = 0): string {
  return (
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="1"/></w:numPr></w:pPr>` +
    `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
  );
}

export function table(rows: readonly (readonly string[])[]): string {
  const cells = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map(
            (cell) => `<w:tc><w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`,
          )
          .join("")}</w:tr>`,
    )
    .join("");
  return `<w:tbl>${cells}</w:tbl>`;
}

export function withFootnote(text: string): string {
  return (
    `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` +
    `<w:r><w:footnoteReference w:id="1"/></w:r></w:p>`
  );
}

export type DocxOptions = {
  /** Replace or add whole parts, for the fixtures about the container itself. */
  readonly parts?: Readonly<Record<string, Uint8Array>>;
  /** Compress the entries, which is what a real Word file does. */
  readonly deflate?: boolean;
};

export function buildDocx(body: string, options: DocxOptions = {}): Uint8Array {
  const document = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`;

  const encoder = new TextEncoder();
  return zipSync(
    {
      "[Content_Types].xml": encoder.encode(CONTENT_TYPES),
      "_rels/.rels": encoder.encode(ROOT_RELS),
      "word/_rels/document.xml.rels": encoder.encode(DOCUMENT_RELS),
      "word/document.xml": encoder.encode(document),
      "word/styles.xml": encoder.encode(STYLES),
      "word/numbering.xml": encoder.encode(NUMBERING),
      "word/footnotes.xml": encoder.encode(FOOTNOTES),
      ...(options.parts ?? {}),
    },
    { level: options.deflate === false ? 0 : 6 },
  );
}

/**
 * The archive whose entries are all zeroes: a few kilobytes of file that
 * unpacks to hundreds of megabytes. It is the reason the container reader
 * counts bytes as it inflates rather than trusting the catalogue.
 */
export function buildZipBomb(unpackedBytes: number): Uint8Array {
  return buildDocx(paragraph("unreachable"), {
    parts: { "word/document.xml": new Uint8Array(unpackedBytes) },
  });
}

/** An archive with more entries than a Word file could plausibly have. */
export function buildCrowdedDocx(entries: number): Uint8Array {
  const parts: Record<string, Uint8Array> = {};
  const filler = new TextEncoder().encode("x");
  for (let index = 0; index < entries; index += 1) {
    parts[`word/media/image${index}.png`] = filler;
  }
  return buildDocx(paragraph("A document with a great many pictures."), { parts });
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Rewrites the uncompressed size a container claims for one of its entries. The
 * catalogue is written by whoever made the archive, which is exactly why the
 * reader treats those numbers as grounds for an early refusal and counts the
 * real bytes as they inflate.
 */
export function claimEntrySize(
  archive: Uint8Array,
  entry: string,
  declared: number,
): Uint8Array {
  const out = archive.slice();
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const name = new TextEncoder().encode(entry);

  for (let at = 0; at + 30 < out.length; at += 1) {
    const local = view.getUint32(at, true) === 0x04034b50;
    const central = view.getUint32(at, true) === 0x02014b50;
    if (!local && !central) continue;

    // Where the name sits, and where the uncompressed size sits, differ between
    // the two headers; everything before them is fixed-width in both.
    const nameAt = local ? at + 30 : at + 46;
    const sizeAt = local ? at + 22 : at + 24;
    if (nameAt + name.length > out.length) continue;
    if (!name.every((byte, index) => out[nameAt + index] === byte)) continue;
    view.setUint32(sizeAt, declared, true);
  }
  return out;
}
