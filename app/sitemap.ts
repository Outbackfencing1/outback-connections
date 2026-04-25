// app/sitemap.ts
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    "https://www.outbackconnections.com.au";

  const routes = [
    { path: "", priority: 1 },
    { path: "/services", priority: 0.9 },
    { path: "/jobs", priority: 0.8 },
    { path: "/freight", priority: 0.8 },
    { path: "/post", priority: 0.5 },
    { path: "/about", priority: 0.4 },
    { path: "/faq", priority: 0.4 },
    { path: "/privacy", priority: 0.2 },
    { path: "/terms", priority: 0.2 },
  ];

  return routes.map(({ path, priority }) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority,
  }));
}
