import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/deals",
        "/reports",
        "/sourcing",
        "/templates",
        "/portfolio",
        "/lp-report",
        "/settings",
        "/upload",
      ],
    },
    sitemap: `${BRAND.url}/sitemap.xml`,
  };
}
