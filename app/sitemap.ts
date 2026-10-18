// app/sitemap.ts
// Public sitemap, generated from current data: static pages + every active
// listing (jobs / freight / services) + service categories with live rows. Uses a
// read-only anon client (public data only); falls back to the static routes
// if the DB is unreachable so the build never breaks.
import type { MetadataRoute } from "next";
import { createAnonClient } from "@/lib/supabase/anon";
import { regionsForPostcodes, regionSlug } from "@/lib/regions";
import { isRuralPostcode } from "@/lib/rural-postcodes";

export const revalidate = 3600; // regenerate hourly

const BASE =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

const STATIC: Array<{ path: string; priority: number }> = [
  { path: "", priority: 1 },
  { path: "/services", priority: 0.9 },
  { path: "/jobs", priority: 0.8 },
  { path: "/freight", priority: 0.8 },
  { path: "/sale", priority: 0.8 },
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

    // Active rural listings, split by kind into their route prefixes.
    const { data: rawListings } = await sb
      .from("listings")
      .select("slug, kind, postcode, state, created_at")
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .limit(10000);

    const listings = (rawListings ?? []).filter((l) => isRuralPostcode(l.postcode, l.state));

    const prefixFor = (kind: string): string | null => {
      if (kind === "job") return "/jobs";
      if (kind === "freight") return "/freight";
      if (kind === "for_sale") return "/sale";
      if (kind === "service_offering" || kind === "service_request") return "/services/listing";
      return null;
    };

    // Don't advertise an empty vertical's browse page to crawlers.
    const hasServices = listings.some(
      (l) => l.kind === "service_offering" || l.kind === "service_request"
    );
    const hasJobs = listings.some((l) => l.kind === "job");
    const hasFreight = listings.some((l) => l.kind === "freight");
    const hasSale = listings.some((l) => l.kind === "for_sale");
    const visibleStatic = staticEntries.filter(
      (e) =>
        (hasServices || !e.url.endsWith("/services")) &&
        (hasJobs || !e.url.endsWith("/jobs")) &&
        (hasFreight || !e.url.endsWith("/freight")) &&
        (hasSale || !e.url.endsWith("/sale"))
    );

    const listingEntries: Row[] = listings
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

    // Regional landing pages: one per (services category, region) with >= 1 live rural row.
    const { data: svc } = await sb
      .from("listings")
      .select("postcode, state, category:categories!inner(slug, pillar)")
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .in("kind", ["service_offering", "service_request"])
      .limit(5000);
    const svcRows = ((svc ?? []) as unknown as {
      postcode: string;
      state?: string | null;
      category: { slug: string; pillar: string } | { slug: string; pillar: string }[] | null;
    }[]).filter((r) => isRuralPostcode(r.postcode, r.state));

    const regionMap = await regionsForPostcodes(svcRows.map((r) => r.postcode));
    const regionPages = new Set<string>();
    const liveCategorySlugs = new Set<string>();
    for (const r of svcRows) {
      const cat = Array.isArray(r.category) ? r.category[0] : r.category;
      if (!cat?.slug || cat.pillar !== "services") continue;
      liveCategorySlugs.add(cat.slug);
      const reg = regionMap.get(r.postcode);
      if (!reg) continue;
      regionPages.add(`${cat.slug}/${regionSlug(reg.region_name, reg.state)}`);
    }

    // Strictly exclude any category with 0 active rural listings.
    const categoryEntries: Row[] = (cats ?? [])
      .filter((c) => c.slug && liveCategorySlugs.has(c.slug))
      .map((c) => ({
        url: `${BASE}/services/${c.slug}`,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      }));
    const regionEntries: Row[] = Array.from(regionPages).map((path) => ({
      url: `${BASE}/services/${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

    return [...visibleStatic, ...categoryEntries, ...regionEntries, ...listingEntries];
  } catch {
    // DB unreachable at build/regen — ship the static map rather than fail.
    return staticEntries;
  }
}
