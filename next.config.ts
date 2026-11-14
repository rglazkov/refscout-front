import createMDXPlugin from "@next/mdx";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

import { defaultLocale, locales } from "./src/lib/i18n/routing";

const pagesBasePath = (process.env.PAGES_BASE_PATH ?? "").replace(/\/$/, "");

if (pagesBasePath !== "" && !pagesBasePath.startsWith("/")) {
  throw new Error("PAGES_BASE_PATH must be empty or start with a slash.");
}

/**
 * Which build this is. Every telemetry event carries it, and without it an
 * event says that something broke and not where: the same symptom in two
 * releases is two different defects, and the report that cannot tell them apart
 * sends somebody looking through code that was never deployed.
 *
 * The commit is preferred because it is the one identifier that leads straight
 * back to the source. A build made on somebody's machine says "dev" outright
 * rather than inventing a version number, so local crashes stay in their own
 * bucket instead of being counted against a release.
 */
const release =
  process.env.NEXT_PUBLIC_RELEASE ??
  (process.env.GITHUB_SHA === undefined ? "dev" : process.env.GITHUB_SHA.slice(0, 7));

/**
 * The unprefixed addresses of the default language, served by `next dev`.
 *
 * The site links to `/`, `/features/`, `/privacy/` and so on with no language
 * prefix, while the app tree generates every language under its own prefix,
 * `/en/` included. In a build, `scripts/postbuild-root-locale.mjs` copies the
 * default language's folder to the top of `out/`, and that is how the
 * unprefixed addresses come to exist. `next dev` serves straight from the app
 * tree and runs no post-build step. In development the site's own links already
 * name the prefixed addresses (`localizedPath` in `src/lib/seo/metadata.ts`),
 * and these redirects cover an address typed or bookmarked without one: every
 * page address that does not start with a language goes to the same address
 * under the default language's prefix, so `/pricing/` opens `/en/pricing/`.
 *
 * They are redirects and not rewrites. With `output: "export"`, `next dev`
 * checks the address the browser asked for against `generateStaticParams()`,
 * and an unprefixed address is never among the prefixed ones it generates, so a
 * rewritten page fails with "missing param". After a redirect the browser asks
 * for the prefixed address itself, and that address passes the check.
 *
 * The pattern leaves alone the internal `_next` and `__nextjs` paths and every
 * path with a dot in it - the files in `public/` (workers, fonts, pdf.js, the
 * mock service worker) and the metadata routes such as `robots.txt`. Page
 * addresses on this site carry no dots.
 *
 * They exist only in development. The static export is served as files and
 * carries no redirects; the copy made after the build is what answers there.
 */
const devPassThrough = [...locales, "_next", "__nextjs"].join("|");
const devRootRedirects: NextConfig["redirects"] = () =>
  Promise.resolve([
    { source: "/", destination: `/${defaultLocale}/`, permanent: false },
    {
      source: `/:path((?!(?:${devPassThrough})(?:/|$))[^.]+)`,
      destination: `/${defaultLocale}/:path`,
      permanent: false,
    },
  ]);

/**
 * Static export: `next build` emits an `out/` folder, and there is no Node in
 * production. The consequences are accepted up front and not revisited: no
 * middleware, no route handlers, no ISR, no server actions. Redirects and
 * headers are configured on the static host, not here.
 */
const nextConfig: NextConfig = {
  output: "export",
  // GitHub project pages live under /<repository>. Locally this stays empty.
  basePath: pagesBasePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: pagesBasePath,
    NEXT_PUBLIC_RELEASE: release,
  },
  pageExtensions: ["ts", "tsx", "mdx"],
  // Every route is a folder with an index.html: that is what any static host serves.
  trailingSlash: true,
  // The image optimiser is server-side; static output has none.
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    /*
     * The application is this folder, and it is said outright rather than
     * inferred. Turbopack looks upwards for a lock file to decide where the
     * project begins; there is a stray `package-lock.json` one level up, beside
     * no `package.json` at all, and finding it there Turbopack warns and guesses.
     * The root decides what is resolved and what is watched, so it is not a
     * thing to leave to a guess.
     */
    root: __dirname,
  },
  experimental: {
    /*
     * Turbopack's dev cache writes a snapshot to disk and then drops the
     * in-memory copy of what it wrote. On this project that loses cells the
     * next hot update still needs, and the update dies with an internal error:
     * the dev server tears its subscription down, resubscribes and reloads the
     * whole page, so every edit costs a full reload instead of a patch. Holding
     * the data in memory for the life of the process costs memory and nothing
     * else - the cache on disk still does its work across restarts.
     */
    turbopackMemoryEviction: false,
    // radix-ui is a barrel of every primitive: without this the bundle pulls in
    // all of them instead of the six we generated.
    optimizePackageImports: ["radix-ui", "lucide-react"],
    // `app/global-not-found.tsx` renders the whole 404 document itself. The
    // page sits outside every root layout, so without this Next wraps it in
    // the one it supplies - an <html> we cannot mark `suppressHydrationWarning`,
    // which turns the theme script's attribute into a hydration mismatch.
    globalNotFound: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  ...(process.env.NODE_ENV === "development" ? { redirects: devRootRedirects } : {}),
};

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

/**
 * Long pages are MDX files in content/. The block at the top of such a file is
 * front matter, not text: `remark-frontmatter` recognises it and keeps it out
 * of the rendered page. Both delimiters are accepted - `---` around a YAML
 * block, `+++` around a TOML one - so that whichever an author writes is read
 * the same way here and by the code that takes the title and description from
 * the file on disk, which is how a page's metadata is known without compiling
 * the page.
 *
 * MDX compiles to components at build time, so no HTML strings appear here and
 * dangerouslySetInnerHTML is not needed.
 */
const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      ["remark-frontmatter", ["yaml", "toml"]],
      // Tables and footnotes: without them the legal pages and the check
      // descriptions with their source links would have to be marked up by hand.
      "remark-gfm",
    ],
  },
});

export default withMDX(withNextIntl(nextConfig));
