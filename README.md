# Manuscript checking client

A statically built front end: `next build` produces an `out/` folder, and there
is no Node in production. The product name, the domain and the palette live in
`brand.config.ts` and in `src/messages/` - they do not appear in the code.

Milestone M1 of the build plan: the whole path, on the formats that are already
text. A person drops a `.txt`, `.md`, `.bib`, `.tex` or `.gls`, sees a card with
the checks it proposes, opens the text and corrects it, reads the plan, runs the
check, watches it stage by stage, gets the findings grouped by document, marks
one as dealt with and downloads the report and the text.

Two things it does not do yet, and both are the next milestones rather than
gaps. PDF and Word arrive in M2 with their parsers - until then such a file is
refused with a way out. And the buffer lives as long as the tab does: the
extracted text is held in memory, storage that survives a reload is M4, and
until it exists the screen says so in as many words.

## Commands

**Two commands cover everything.** `npm run check` is every check that needs
neither a browser nor the network, and `npm run verify` is that plus the build
and the browser lane - what to run before opening a pull request.

| Command                | What it does                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| `npm run check`        | Formatting, lint, types, the tests, and the contract against its generated output         |
| `npm run verify`       | `build` plus e2e: everything there is                                                     |
| `npm run dev`          | Development                                                                               |
| `npm run build`        | Runs `check` first, then the static build into `out/`, the headers and the bundle budgets |
| `npm start`            | Serves the built static output (without headers - for a quick look)                       |
| `npm run typecheck`    | `tsc --noEmit`                                                                            |
| `npm run lint`         | ESLint directly, not through `next lint`                                                  |
| `npm test`             | Vitest: architecture tests, contrast, dictionaries, contract                              |
| `npx playwright test`  | e2e: theme without a flash, CSP violations, headers - desktop and mobile                  |
| `npm run size`         | The bundle budgets on their own; `npm run build` already runs this                        |
| `npm run size:update`  | Re-records those sizes after a change that legitimately grew a page                       |
| `npm run contract`     | Regenerates the wire types, zod schemas and mocks from the contract                       |
| `npm run fonts`        | Re-vendors the fonts from upstream; never runs during a build                             |
| `npm run brand:assets` | Redraws the tab icon and the social image from `brand.config.ts`                          |

`typecheck`, `lint`, `test`, `playwright test`, `size` and `contract` are the
parts the two commands above are made of. They stay because a failing step is
quicker to iterate on its own - not because there is an order to remember.

**A build cannot skip the checks**: `prebuild` runs `check`, so `npm run build`
is formatting, lint, types, tests and contract drift, then the build, the
default language copied to the root, the headers and the budgets. The fast CI
lane is that one command and nothing else, which is what keeps CI and a
developer's machine from slowly disagreeing about what "green" means.

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
- No text lives in component code - only dictionary keys; no colours live in the
  code - only `src/app/tokens.css`; the product name does not appear in `src/`.
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
It belongs in the header beside the theme (§15) and is left out while there is
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

The contract is one OpenAPI document, and it is written in the API
specification - the document the backend developer reads and agrees to. Nothing
in this repository is the place to edit it:

```text
refscout_api_spec.md  (section 16)     the document; edited here
  -> npm run contract:extract          lifts the OpenAPI block out of it
       contract/refscout-api.yaml      committed, because CI has no access
                                       to the specification
  -> npm run contract                  regenerates everything below
       src/lib/api/wire/               the types and the zod schemas
       src/test/msw/handlers.gen.ts    the mocks
```

The extraction is deliberately not part of `npm run contract`: the
specification lives outside this repository, so a checkout in CI does not have
it, and the committed YAML is what every other step reads. CI re-runs
`npm run contract` and fails if the generated files have drifted from it.

**The mocks are the contract's own `examples`.** A response with no example
serves nothing, and that shows up as a missing handler rather than as a
fabricated body: there is no body to invent that would still be the contract.
Which cases have to exist is section 15 of the specification - a clean finish, a
partial failure, a whole job failed, a skipped module, a finding pointing across
documents, a Cite result with both groups, and anchors of a kind this version of
the schema does not define. Adding a case means adding an example there.

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

Chunks that load later - pdf.js, CodeMirror, the `.docx` builder - are not in
these numbers and are not meant to be: they do not compete with the first
paint. They get their own entries in M2, measured as the weight of the action
that pulls them rather than as a cap on any single chunk. What keeps them out
of the first screen is the architecture test, not a budget.

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
