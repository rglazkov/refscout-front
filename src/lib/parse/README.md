The libraries that read documents and the one that writes a document back, and
the only place any of them is named. Reading takes bytes and gives back a
canonicalised text with whatever the format also carries — a page map and
metadata for PDF, the entries of a bibliography and what is wrong with them for
`.bib` and `.tex`, nothing for a `.txt`. A refusal is data with numbers in it,
never an exception the caller has to recognise.

Both directions live together because one format is a container rather than
text: a Word file is read here and assembled here, by libraries of the same
weight, in the same worker. Every other format is written out as the string it
already is — printing a `.tex` back through a library would hand its author a
correct file with a thousand reformatted lines in it.

Reachable from `src/workers` and from the tests, and from nowhere else: that is
what "nothing is parsed outside a worker" means in code.
