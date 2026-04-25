// app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

  return {
    rules: {
      userAgent: "*",
      allow: ["/"],
      disallow: [
        "/api/",
        "/auth/",
        "/dashboard/",
        "/signin",
        "/signup",
        "/verify/",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
