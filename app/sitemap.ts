// app/sitemap.ts
// Public sitemap, generated from current data: static pages + every active
// listing (jobs / freight / services) + active service categories. Uses a
// read-only anon client (public data only); falls back to the static routes
// if the DB is unreachable so the build never breaks.
import type { MetadataRoute } from "next";
import { createAnonClient } from "@/lib/supabase/anon";

export const revalidate = 3600; // regenerate hourly

const BASE =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

const STATIC: Array<{ path: string; priority: number }> = [
  { path: "", priority: 1 },
  { path: "/services", priority: 0.9 },
  { path: "/jobs", priority: 0.8 },
  { path: "/freight", priority: 0.8 },
  { path: "/post", priority: 0.5 },
  { path: "/about", priority: 0.4 },
  { path: "/faq", priority: 0.4 },
  { path: "/privacy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
  { path: "/acceptable-use", priority: 0.2 },
  { path: "/cookies", priority: 0.2 },
];

type Row = { url: string; lastModified: Date; changeFrequency: "weekly" | "daily"; priority: number };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: Row[] = STATIC.map(({ path, priority }) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority,
  }));

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return staticEntries;
  }

  try {
    const sb = createAnonClient();
    const nowIso = now.toISOString();

    // Active listings, split by kind into their route prefixes.
    const { data: listings } = await sb
      .from("listings")
      .select("slug, kind, created_at")
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .limit(10000);

    const prefixFor = (kind: string): string | null => {
      if (kind === "job") return "/jobs";
      if (kind === "freight") return "/freight";
      if (kind === "service_offering" || kind === "service_request") return "/services/listing";
      return null;
    };

    const listingEntries: Row[] = (listings ?? [])
      .map((l): Row | null => {
        const prefix = prefixFor(l.kind);
        if (!prefix || !l.slug) return null;
        return {
          url: `${BASE}${prefix}/${l.slug}`,
          lastModified: l.created_at ? new Date(l.created_at) : now,
          changeFrequency: "daily",
          priority: 0.7,
        };
      })
      .filter((r): r is Row => r !== null);

    // Active service categories -> /services/[slug]
    const { data: cats } = await sb
      .from("categories")
      .select("slug")
      .eq("country_code", "AU")
      .eq("pillar", "services")
      .eq("active", true)
      .limit(1000);

    const categoryEntries: Row[] = (cats ?? [])
      .filter((c) => c.slug)
      .map((c) => ({
        url: `${BASE}/services/${c.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));

    return [...staticEntries, ...categoryEntries, ...listingEntries];
  } catch {
    // DB unreachable at build/regen — ship the static map rather than fail.
    return staticEntries;
  }
}
