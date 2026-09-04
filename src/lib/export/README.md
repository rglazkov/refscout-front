Handing a file back. One rule — the format it was brought in — and one
mechanism: a Blob, a link carrying `download`, and the object URL released at
once. `.bib`, `.tex`, `.gls`, `.md` and `.txt` are written as the text they
already are, with the byte-order mark and the line ending the file arrived with
put back; `.docx` is assembled in a worker, because it is a container rather
than text. A PDF and text that was typed come back as `.txt`, having no format
of their own to give back.
