Handing a file back. One rule — the format it was brought in — and one
mechanism: a Blob, a link carrying `download`, and the object URL released at
once. `.bib`, `.tex`, `.gls`, `.md` and `.txt` are written as the text they
already are, with the byte-order mark and the line ending the file arrived with
put back; `.docx` is assembled in a worker, because it is a container rather
than text. A PDF and text that was typed come back as `.txt`, having no format
of their own to give back.

The findings report is the one file here that is not a document coming back. It
is built rather than converted: `report.ts` turns a finished job into the shape
the report has — documents, checks, findings, places, quoted fragments, with
every piece of wording already chosen — and `pdf/` sets that shape on A4 in the
product's own faces and colours. There is no text format in between and nothing
is escaped anywhere along the way: a PDF has no markup for a character to be
mistaken for, so an asterisk or a bracket out of somebody's manuscript is drawn
as the character it is, which matters because several of the checks are about
exactly those characters.

The writing happens in a worker. The writer and the four faces it embeds are
most of a megabyte, nobody who has not asked for a report should download them,
and a job over a thesis carries thousands of findings to measure, wrap and draw.
