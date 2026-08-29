import type { MetadataRoute } from "next";

import { absoluteUrl } from "@/lib/brand";
import { routes } from "@/lib/seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: routes.filter((route) => !route.indexable).map((route) => route.path),
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
