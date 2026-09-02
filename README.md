# Manuscript checking client

A statically built front end: `next build` produces an `out/` folder, and there
is no Node in production. The product name, the domain and the palette live in
`brand.config.ts` and in `src/messages/` - they do not appear in the code.

**What works today: the findings come back as findings.** A person drops a PDF,
a `.docx`, a `.txt`, `.md`, `.bib`, `.tex` or `.gls`, sees a card with the
checks it proposes, opens the text and corrects it, reads the plan, runs the
check, watches it stage by stage, and gets the findings grouped by document -
each one saying where it is in words, a page, an entry of a bibliography, the
sentence the module was reading. They mark one as dealt with or turn it down,
and take the report and the text away as files.

**Two more tools sit beside the checks, and neither starts from a document in
the buffer.** A search takes a topic and gives back real papers from ten
bibliographic databases: the query string is the whole of what leaves the tab,
and the order of the answer, every filter over it and the `.bib` of what was
kept are worked out here. A comparison takes two versions - a `.docx` against
the PDF it was printed to, a thesis against last week's thesis - marks what
changed in both panes, and reaches no server at all. Each is a mode of the
working screen with one way in, the pair of buttons that stand beside "paste
text" while the buffer is empty, and one way out, "Back"; entering either and
coming back leaves the buffer exactly as it was.

**The file never leaves the browser.** Every format is read in a worker - pdf.js
for PDF, mammoth and turndown for Word, our own code for the rest - and only the
extracted text is ever sent. That makes the quality of the reading ours and
visible: a document that would not read keeps its card, says why in numbers and
offers a way out that can be taken there - a password, another attempt, another
file, or the text typed in by hand.

Two things it does not do yet, and both are scheduled work rather than gaps. A
Word file is downloaded as `.md` until the browser can build a `.docx` again,
and the button says so. And the buffer lives as long as the tab does: the
extracted text is held in memory, storage that survives a reload is not built
yet, and until it exists the screen says so in as many words.

**The backend does not exist yet, and three things are owed the moment it does.**
A body of real size has to go through a stand in the same week the parsing
works: the compression, the timeouts and the refusals of a fifty-document
submission are answered by a real proxy and a real server or by nobody. The seam
with a live module is what the current work is for - everything on this side of
it is built and tested against the contract's own examples, but the question it
answers is the first reply from a real check. All four checks are wired the same
way and drawn by the same screen, and the two with a language model in them are
the slowest to arrive, so they are the ones most likely to answer `skipped` for
a while: that is a state the interface already draws, and the day the server
starts answering with findings instead, nothing here changes. And a search is
the third: the databases behind it are the server's, so what the list actually
looks like - how many answer, how often two of them time out - is a question
only a stand answers. Until then no claim here rests on a module or a database
having actually run.

**A finding's place is worked out here and is given up rather than guessed.**
The module sends offsets counted over the text it was given, and every body says
which text that was: the hash and the length the server recomputed. Against them
stands what we kept when we sent it (`src/lib/docs/snapshot.ts`), and the two
have to agree before a single number in that body is used. When they do not -
or when the body declares an offset unit the contract does not define - the
findings are all still shown, and shown without places, with the identifier of
the request on the card. The reason is that a highlight standing on coordinates
from another version of the text looks exactly like a correct one, so a finding
about page 4 quietly appears on page 5 and is read as our work rather than as a
defect. A list without places is a useful result; a place that is wrong costs
the trust in every place beside it.

**Connecting a module is its codes in the dictionary and one renderer of its
details** (`src/features/results/details/`), and that is enforced rather than
asserted: a test fails on the name of a module appearing in the code the four of
them share. Cite is the one exception the test allows, and not about the shape
of its findings - it proposes sources rather than reporting problems, and a
claim with its candidates is a screenful, so its card opens over the page.

## Commands

**Two commands cover everything.** `npm run check` is every check that needs
neither a browser nor the network, and `npm run verify` is that plus the build
and the browser lane - what to run before opening a pull request.

| Command                 | What it does                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `npm run check`         | Formatting, lint, types, the tests, and the contract against its generated output         |
| `npm run verify`        | `build` plus e2e: everything there is                                                     |
| `npm run dev`           | Development                                                                               |
| `npm run build`         | Runs `check` first, then the static build into `out/`, the headers and the bundle budgets |
| `npm start`             | Serves the built static output (without headers - for a quick look)                       |
| `npm run typecheck`     | `tsc --noEmit`                                                                            |
| `npm run lint`          | ESLint directly, not through `next lint`                                                  |
| `npm test`              | Vitest: architecture tests, contrast, dictionaries, contract                              |
| `npx playwright test`   | e2e: theme without a flash, CSP violations, headers - desktop and mobile                  |
| `npm run size`          | The bundle budgets on their own; `npm run build` already runs this                        |
| `npm run size:update`   | Re-records those sizes after a change that legitimately grew a page                       |
| `npm run contract`      | Regenerates the wire types, zod schemas and mocks from the contract                       |
| `npm run fonts`         | Re-vendors the fonts from upstream; never runs during a build                             |
| `npm run brand:assets`  | Redraws the tab icon and the social image from `brand.config.ts`                          |
| `npm run pdfjs:assets`  | Copies pdf.js character maps, standard fonts and wasm into `public/pdfjs`                 |
| `npm run workers:build` | Builds the workers from `src/workers` into `public/workers`                               |
| `npm run probe:workers` | Serves a page that starts a worker, to check a browser the lane cannot                    |

`typecheck`, `lint`, `test`, `playwright test`, `size` and `contract` are the
parts the two commands above are made of. They stay because a failing step is
quicker to iterate on its own - not because there is an order to remember.

**The workers are built before the build and before `dev`**, by `prebuild` and
`predev`. There is no watch on them: after changing anything under
`src/workers` or `src/lib/parse`, run `npm run workers:build` again, or restart
`npm run dev`. The page is served from `public/workers`, so a stale build is a
stale worker rather than a compile error, and that is worth knowing before
spending an afternoon on it.

**A build cannot skip the checks**: `prebuild` runs `check`, so `npm run build`
is formatting, lint, types, tests and contract drift, then the build, the
default language copied to the root, the headers and the budgets. The fast CI
lane is that one command and nothing else, which is what keeps CI and a
developer's machine from slowly disagreeing about what "green" means.

**Three browser projects, and the third runs two files.** `desktop` and `mobile`
are Chromium and run the suite; `firefox` runs `e2e/shared/worker-start.spec.ts`
and `e2e/desktop/diff-alignment.spec.ts`. What a second engine answers is
whether a worker starts and reads a document here, and whether the two panes of
a comparison stay level - which rests on how the browser measures text, the one
part of the layout that is a different answer in a different engine. The rest of
the suite is contrast and wording, which do not turn on the engine. Playwright's Firefox is a patched build that
quietly ignores `type: "module"`, so what that project exercises is the classic
fallback, which is exactly the path a browser like that takes in the product.

**`npm run probe:workers` is the other half**, and it is the one that speaks for
a real browser: it serves a page that starts a worker and reads a document
through it, and prints what the browser reports. Open it in whatever you want to
check - the browser on your desk, an old Safari, a phone on the same network.

`verify` needs a build for e2e and makes one, so run it directly - the
`scripts/serve-out.mjs` server starts on its own and serves the files with the
same headers as production. Browsers install once with
`npx playwright install chromium`.

**Which server answers is a variable, not a branch in the code.**
`NEXT_PUBLIC_API_SOURCE` selects `mock` or `stand`, and both go through the same
`src/lib/api/client.ts`. The mock is not a development-only version: it serves
the contract's own example bodies from a service worker in the tab, it is the
same set of handlers the fast tests use, and it is what makes offline work and a
green browser lane possible without a server. A build made with `stand` ships
none of it. Pointing the browser lane at a real stand is
`NEXT_PUBLIC_API_SOURCE=stand NEXT_PUBLIC_API_ORIGIN=… npm run verify`, which is
exactly what the nightly contract job runs once `API_STAND_URL` is set.

Two checks stay outside `check` on purpose. `npm audit` needs the network, so it
is a CI step rather than something that breaks a build on a train; and
`npm run fonts` reaches upstream, which is why it is a weekly pull request
instead of a build step.

## What here is not allowed to reach into what

A rule written in prose survives until the first deadline, so each of these has
an enforcer. The linter catches direct imports and the test in
`src/test/architecture.test.ts` catches the way around them through a
re-export; both are needed.

- There is no network anywhere except `src/lib/api` and `src/lib/telemetry`.
- The types in `src/lib/api/wire` never leave `src/lib/api`: the shape of
  somebody else's JSON must not leak into the screens.
- Telemetry has no access to the registry of document texts - neither directly
  nor through a chain of imports.
- Intake and extraction (`features/intake`) know nothing about the buffer.
- The texts of documents live in one module, `src/lib/docs/registry.ts`, outside
  React and outside any store. Five places may reach it: intake, which fills it;
  the editor, which changes it; storage, which will persist it; the API, at the
  moment of sending; and `lib/export`, which assembles the file handed back.
- The contents of `features/` are mounted only through `next/dynamic` with
  `ssr: false`. The static text of a page lives in `components/marketing/`,
  otherwise it never reaches the HTML.
- The workers are built by us, into `public/workers`, and loaded from a fixed
  address. The application bundler ships `new Worker(new URL(…))` as a bootstrap
  that reads its chunk list out of its own address, and that bootstrap does not
  start in Firefox - silently, which is the one way a worker must never fail.
  Each is built twice, as a module worker and as a classic script that needs no
  module support, and a worker that has not said `ready` in three seconds is
  replaced by the second rather than waited on.
- Nothing is parsed outside a worker. `src/lib/parse` is reachable from
  `src/workers` and from the tests alone, the parsing libraries are named in
  that one folder, and no code a worker runs touches the DOM or the network -
  the class of risk that comes with reading strangers' binary formats has moved
  from the server into the tab, and the worker is the box it is kept in.
- Comparing two versions cannot reach the layer that sends: the mode has
  nothing to send, and the architecture test says so rather than the prose. The
  comparison itself runs in its own worker, because it is one pass over both
  texts in full - a thesis against a thesis is six million characters, and on
  the thread the panes are drawn on that is seconds of a frozen tab with the
  caret in it.
- A bibliographic record is drawn by one component, wherever it appears. A
  search result and a candidate proposed for a claim are the same record in the
  contract, and two cards for it would differ by the second edit.
- There is one markdown parser in the project, and it is markdown-it. It arrives
  with the `.docx` export path; until then the rule is enforced against every
  other one.
- No text lives in component code - only dictionary keys; no colours live in the
  code - only `src/app/tokens.css`; the product name does not appear in `src/`.
- The dictionary is split where the product is. The provider at the root carries
  the namespaces the site's own pages read (`shellNamespaces` in
  `src/lib/i18n/messages.ts`); everything the working screen says - the cards,
  the states of an extraction, the findings, every refusal the server can give -
  is most of the dictionary and arrives in the chunk that screen arrives in, for
  the one language being read. Handed whole to the root, all of it is written
  into the HTML of every address, and the page of the privacy policy is served
  with the wording of a password prompt. A test holds the boundary in both
  directions, because a namespace read by a page and missing from the shell is a
  placeholder that appears only in a browser.
- Every text a developer reads here explains itself. No pointers into the
  planning documents - no section marks, no stage codes - because they are
  edited outside this repository and their numbering moves, so such a sentence
  becomes wrong without anything here noticing. Where a reference was carrying
  the explanation, the replacement is to say the thing itself. A test greps for
  them.
- One module writes to `localStorage`: `src/lib/theme`.

## How to add and how to remove a check

A check is a file too: `content/en/features/scout.mdx`.

```mdx
---
order: 1 # position in the lists
icon: search # the card icon: search, code, message, shield, type, columns, check
name: Scout # the short name used on cards
summary: One sentence under the name on the card.
title: Scout — multi-source literature search # the page title, optional
description: The page subtitle and the description used in search results, optional
---

The text of the page follows.
```

Every place the check is mentioned comes out of that file: the card at the
bottom of the workspace screen, the card in the `/features/` list, the
`/features/scout/` page itself and the sitemap entry.

**Removing it means deleting the file.** Both cards, the address and the sitemap
entry disappear with it: there is nowhere left to read them from. Links to the
removed page from other texts will not break silently - a test walks every text
and fails if a link points at a page that does not exist.

## How to add a language

Two things, and neither of them is a route:

1. an entry in `locales` in `src/lib/i18n/routing.ts`;
2. `src/messages/{locale}.json` beside `en.json`, with the same keys - a test
   fails on a language that is a few keys behind, so a half-translated language
   cannot be published in silence.

The pages follow on their own. There is one tree, `src/app/[locale]/`, and its
folders are expanded from that list at build time. `hreflang`, the sitemap and
the links in the header and footer read the same list, so they start describing
the new language the moment it exists - and cannot describe one that does not.

**The third thing is the switcher**, and it is the only part not already built.
It belongs in the header beside the theme toggle and is left out while there is
one language, because a menu with a single row asks a question with one answer.
Its pieces are in place: `unlocalizedPath` in `src/lib/seo` turns the address
being read into the same page in another language - switching has to leave the
reader where they were - and its words wait in the `language` namespace of the
dictionaries, declared in `src/test/messages.test.ts` as text written ahead of
its screen.

**The tree does not hold the body of any page**: the route files delegate to
`src/components/pages/`, and a test fails on a page that renders markup of its
own or that lives outside `[locale]`.

Page text is per language as well: `content/{locale}/…`. A language whose
folder does not describe a check simply gets no page for that check, rather
than a page in the wrong language.

### Why the root is a copy

Every language is generated under its own prefix, `/en/` included, and
`scripts/postbuild-root-locale.mjs` then copies the default language's folder
to the top of `out/`. That is what makes `/privacy/` exist at all.

It looks roundabout until you try the alternatives. next-intl serves a default
language without a prefix through its `as-needed` mode, which rests on
middleware, and a static export has none. Building a second, unprefixed tree
beside this one works, but it makes two root layouts - and Next reloads the
whole document when navigation crosses between them, so switching language
would stop being instant, which is the one thing the language switcher must be.

The canonical form is the unprefixed one: `canonical`, `hreflang` and the
sitemap all name it, because `localizedPath` gives the default language no
prefix. The prefixed copy is left in place and advertised nowhere.

Nothing in the router produces the root, so nothing but a check notices when
the copy stops happening - which is why `/` and `/en/` are compared byte for
byte both in the e2e suite and by `scripts/check-headers.mjs` against a
deployed environment.

## How to add the text of a page

The rule follows from the URL: **the page path without slashes is the file
name.**

| Page               | File                            |
| ------------------ | ------------------------------- |
| `/privacy/`        | `content/en/privacy.mdx`        |
| `/pricing/`        | `content/en/pricing.mdx`        |
| `/features/scout/` | `content/en/features/scout.mdx` |

Front matter is optional here, but if `title` and `description` are set they
become the page title, the subtitle and the metadata - and then the page
describes itself in a single file. Without front matter, whatever is in the
dictionary is used.

While the file is missing, the page says the text is being prepared - a normal
state rather than a breakage. The opposite is checked too: a file no address
answers to fails a test. Otherwise text that had been written would sit silently
in the repository, never appearing on the site.

Such a file creates no new addresses: a page like `/privacy/` is also a
navigation entry, metadata and a decision about search indexing, so it is
declared in the list of routes (`src/lib/seo/routes.ts`). The checks are a
deliberate exception: there a new file is supposed to create a page.

## Blocks inside the texts

Ordinary markdown is enough almost everywhere. Beyond it, three blocks are
available:

```mdx
<Card title="What Scout does">- First item - Second item</Card>

<Badges items={["Semantic Scholar", "OpenAlex", "Crossref"]} />

<Callout>A line with a call to action.</Callout>
```

There are deliberately few of them: a file holding text should stay text rather
than become layout.

## The API contract

The contract is one OpenAPI document, and it is written and agreed with the
backend developer outside this repository. Nothing here is the place to edit
it:

```text
the agreed API document           edited there, not here
  -> npm run contract:extract     lifts the OpenAPI block out of it
       contract/refscout-api.yaml committed, because CI cannot reach
                                  the document it came from
  -> npm run contract             regenerates everything below
       src/lib/api/wire/          the types and the zod schemas
       src/test/msw/handlers.gen.ts   the mocks
```

The extraction is deliberately not part of `npm run contract`: the document it
reads lives outside this repository, so a checkout in CI does not have it, and
the committed YAML is what every other step reads. CI re-runs `npm run contract`
and fails if the generated files have drifted from it.

**The mocks are the contract's own `examples`.** A response with no example
serves nothing, and that shows up as a missing handler rather than as a
fabricated body: there is no body to invent that would still be the contract.
The cases that have to exist are a clean finish, a partial failure, a whole job
failed, a skipped module, a finding pointing across documents, a Cite result
with both groups, and anchors of a kind this version of the schema does not
define. Adding a case means adding an example to the contract.

Nothing in the contract has been confirmed by the other side yet, so expect it
to move. It costs little when it does: no application code names a wire type -
the linter and the architecture test see to that - so a renamed schema reaches
exactly one hand-written file, `src/test/contract.test.ts`.

## What a page is allowed to weigh

`budget.json` holds what each page actually cost when it was last measured, and
**`npm run build` checks it** - the post-build step says by how much a page went
over and prints the command that records a new size, so nobody has to remember
either. Re-recording is a person's job (`npm run size:update`) inside the change
that made the page heavier: the new number then arrives as a line in a diff
somebody can ask about, instead of as a limit quietly raised to fit.

Two pages are recorded, and the pair is the point. `/` is what a first visit
pays, being the landing page and the working screen at once; `/privacy/` is an
ordinary static page. **The difference between the two is what the working
screen adds on top of the shell**, and when that difference starts growing,
something that should arrive on demand is arriving up front.

**The third entry counts both builds of the workers, so it is larger than what
any one person downloads: a browser takes the module build or the classic one,
never both. The third entry is everything that arrives later**: every chunk the build
produced that no page asks for up front - pdf.js, mammoth, turndown, CodeMirror.
It is one number rather than a cap per chunk, because the question worth asking
is how much the on-demand half has grown, and a per-chunk cap answers that only
for the chunk somebody thought to name. What keeps any of it out of the first
screen is the architecture test, not a budget.

## The corpus of documents

The parsers are run against a corpus, and every document in it is built from
bytes in `src/test/corpus/` - a PDF with a broken cross-reference table, one
protected with a password, one whose pages are pictures, three hundred pages of
prose, a Word file with a table and a footnote, an archive that unpacks to
hundreds of megabytes. **No manuscript of anybody's is in this repository**, and
the way that stays true by accident as well as on purpose is that there is
nowhere to put one: a file somebody sends us is an unpublished work, and its
place is not in a git history. That is also why a bad parse reports numbers to
telemetry and never the text that produced it.

**What is checked are invariants, never a reference text.** A test comparing
extraction against a stored string turns red on every pdf.js release over one
space that moved; people stop fixing it, and then they turn it off. So the
questions are the ones that stay true across versions: how many pages, roughly
how much text, are the phrases still there, what share of it is printable, are
there replacement characters, did the metadata come out. For the formats that
are already text the invariant is exact instead: what was read is the file, byte
for byte, once the line endings are normalised. There is one encoding in the
product and it is UTF-8: a `.txt` is decoded like any other file, nothing
records what its bytes were written in, and nothing offers to change it.

Two things need a browser and live in the browser lane
(`e2e/shared/manuscripts.spec.ts`): that a worker starts at all, and that a
document written in Chinese is readable - which it is only if `public/pdfjs`
was copied, because without the character maps it extracts as an empty string
and is reported as a scan.

## Fonts

The font files are committed to `public/fonts` and the `@font-face` rules in
`src/app/fonts.css` are generated beside them. **A build reads them off the disk
and fetches nothing**, which is what `font-src 'self'` in the CSP says and what
keeps a release working when a package is withdrawn or a host is down.

They still stay current without anyone tracking versions:
`.github/workflows/fonts.yml` runs `npm run fonts` weekly and opens a pull
request when a family has moved. A face's metrics can change between releases,
so that arrives as a diff to look at rather than as something a deploy did.

Two choices in `scripts/sync-fonts.mjs` are worth knowing about. Literata is
taken on its optical-size files, so a heading and a footnote are drawn for
their sizes rather than being one drawing scaled - which costs about 58 kB on a
page that shows prose, a number no budget here is watching. And the generated
stylesheet ends with a face that is not ours: Georgia, with its box bent to
Literata's metrics, so that the moment the web font arrives is not a jump of
the whole page.

## Headers and the CSP

`config/security-headers.mjs` is the single source of truth. The post-build step
computes the hashes of each page's inline scripts, substitutes them into
`script-src` and writes `out/_headers` together with the reference file
`out/security-headers.json`. `scripts/check-headers.mjs <address>` compares a
deployed environment against that reference: a policy applied only in the
repository protects nobody.
