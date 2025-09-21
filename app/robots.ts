// app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

  return {
    rules: {
      userAgent: "*",
      allow: ["/"],
      disallow: ["/api/", "/dashboard/"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
