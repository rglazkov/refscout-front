import createMDXPlugin from "@next/mdx";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

/**
 * Static export: `next build` emits an `out/` folder, and there is no Node in
 * production. The consequences are accepted up front and not revisited (§2):
 * no middleware, no route handlers, no ISR, no server actions. Redirects and
 * headers are configured on the static host, not here.
 */
const nextConfig: NextConfig = {
  output: "export",
  pageExtensions: ["ts", "tsx", "mdx"],
  // Every route is a folder with an index.html: that is what any static host serves.
  trailingSlash: true,
  // The image optimiser is server-side; static output has none.
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // radix-ui is a barrel of every primitive: without this the bundle pulls
    // in all of them instead of the six we generated (M0.9.3).
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
};

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

/**
 * Long pages are MDX files in content/. Title and description come from the
 * front matter: a plugin turns it into a `frontmatter` export instead of us
 * parsing it by hand.
 *
 * MDX compiles to components at build time, so no HTML strings appear here and
 * dangerouslySetInnerHTML is not needed (§16).
 */
const withMDX = createMDXPlugin({
  extension: /\.mdx?$/,
  options: {
    remarkPlugins: [
      ["remark-frontmatter", ["yaml"]],
      ["remark-mdx-frontmatter", { name: "frontmatter" }],
      // Tables and footnotes: without them the legal pages and the check
      // descriptions with their source links would have to be marked up by hand.
      "remark-gfm",
    ],
  },
});

export default withMDX(withNextIntl(nextConfig));
