// app/sitemap.ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://www.outbackconnections.com.au";

  const routes = ["", "/help", "/about", "/privacy", "/terms"].map((p) => ({
    url: `${base}${p}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : p === "/help" ? 0.9 : 0.5,
  }));

  return routes;
}
