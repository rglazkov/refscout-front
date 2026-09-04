The workers and the typed client in front of them. `parse.worker.ts` reads every
document, reads the structure of one again after it has been edited, and
assembles the one format that is a container rather than text — pdf.js, mammoth,
turndown, citation-js, unified-latex, markdown-it and the Word assembler all
arrive inside it through `import()`, with the document that needs them.
`gzip.worker.ts` compresses the one request that carries text, and
`diff.worker.ts` compares two versions, which is one pass over both of them in
full and so belongs nowhere near the thread the panes are drawn on.

**Three calls, one worker.** Which of the three a message asks for travels in
the envelope, so reading a Word file and writing one back share a script and a
pool instead of shipping the same megabyte twice.

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

**Parsing runs on a small pool, not on one worker.** Cancelling means
terminating - a parser inside a synchronous conversion cannot be asked politely
to stop - and with a single worker the only honest way to keep that from
cancelling somebody else's document was to serialise every call, so a document
stopped on its card waited for the queue in front of it. A call now holds its
own instance: ending it ends that instance and nothing else. The size follows
the machine, one fewer than the cores it reports and never more than three,
because a hundred megabytes of PDF being inflated is hundreds of megabytes in
the tab and four of those at once is a tab the browser ends. Compression and
comparison keep one worker each, being asked for one at a time.

Nothing here touches the DOM or the network, and `src/lib/parse` is reachable
from this folder alone: both are held by `src/test/workers.test.ts`.
