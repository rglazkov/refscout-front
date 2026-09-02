The workers and the typed client in front of them. `parse.worker.ts` reads
every document — pdf.js, mammoth and turndown arrive inside it through
`import()`, with the document that needs them — `gzip.worker.ts` compresses the
one request that carries text, and `diff.worker.ts` compares two versions,
which is one pass over both of them in full and so belongs nowhere near the
thread the panes are drawn on.

**They are built by us**, by `scripts/build-workers.mjs` into `public/workers`,
and not by the application bundler: its way of shipping `new Worker(new URL(…))`
does not start in Firefox, and it fails silently, which is the one way a worker
must never fail.

Two things make a silent failure impossible now. A worker says `ready` before
anything is sent to it, so one that cannot start is reported as a worker that
could not start rather than as a document that took too long. And each is built
twice: as a module worker, which is the ordinary case and the one that keeps
pdf.js away from a person who brought a `.bib`, and as a classic script with
nothing to import, used when the first does not answer within three seconds.
Whoever lands on the second downloads both parsers instead of one, which is the
right price for the product working at all there.

Nothing here touches the DOM or the network, and `src/lib/parse` is reachable
from this folder alone: both are held by `src/test/workers.test.ts`.
