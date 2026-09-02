The parsers, and the only place the parsing libraries are named. Each takes
bytes and gives back a canonicalised text with whatever the format also carries
— a page map and metadata for PDF, nothing for a `.txt`. A refusal is data with
numbers in it, never an exception the caller has to recognise.

Reachable from `src/workers` and from the tests, and from nowhere else: that is
what "nothing is parsed outside a worker" means in code.
