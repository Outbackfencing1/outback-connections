// lib/regions.ts
// Postcode -> region lookups from the public `regions` table (postcode, state,
// lga, region_name). Powers "browse by region" links and the regional landing
// pages under each services category. Cached; the table is static reference
// data.
import { unstable_cache } from "next/cache";
import { createAnonClient } from "./supabase/anon";

export type Region = { region_name: string; state: string };
export type RegionWithPostcodes = Region & { postcodes: string[] };

export function regionSlug(regionName: string, state: string): string {
  const base = regionName
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${state.toLowerCase()}`;
}

export function regionLabel(r: Region): string {
  return `${r.region_name}, ${r.state}`;
}

async function fetchRegionsForState(state: string): Promise<{ postcode: string; region_name: string }[]> {
  const sb = createAnonClient();
  const { data, error } = await sb
    .from("regions")
    .select("postcode, region_name")
    .eq("state", state)
    .not("region_name", "is", null)
    .limit(5000);
  if (error) {
    console.error("[regions] fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as { postcode: string; region_name: string }[];
}

const getRegionsForState = unstable_cache(fetchRegionsForState, ["regions-by-state-v1"], {
  revalidate: 60 * 60 * 24,
});

/** Resolve a slug like "central-west-nsw" to its region + postcodes, or null. */
export async function getRegionBySlug(slug: string): Promise<RegionWithPostcodes | null> {
  const m = /^(.+)-([a-z]{2,3})$/.exec(slug);
  if (!m) return null;
  const state = m[2].toUpperCase();
  const rows = await getRegionsForState(state);
  const postcodes: string[] = [];
  let name: string | null = null;
  for (const r of rows) {
    if (regionSlug(r.region_name, state) === slug) {
      name = r.region_name;
      postcodes.push(r.postcode);
    }
  }
  if (!name || postcodes.length === 0) return null;
  return { region_name: name, state, postcodes: Array.from(new Set(postcodes)) };
}

/** Map a set of postcodes (any state) to their region. Unknown postcodes are omitted. */
export async function regionsForPostcodes(postcodes: string[]): Promise<Map<string, Region>> {
  const out = new Map<string, Region>();
  const wanted = Array.from(new Set(postcodes.filter((p) => /^[0-9]{4}$/.test(p))));
  if (wanted.length === 0) return out;
  const sb = createAnonClient();
  const { data } = await sb
    .from("regions")
    .select("postcode, state, region_name")
    .in("postcode", wanted)
    .not("region_name", "is", null)
    .limit(5000);
  for (const r of (data ?? []) as { postcode: string; state: string; region_name: string }[]) {
    if (!out.has(r.postcode)) out.set(r.postcode, { region_name: r.region_name, state: r.state });
  }
  return out;
}

/** Group listing postcodes into regions with counts, biggest first. */
export async function regionCounts(
  postcodes: string[]
): Promise<Array<Region & { slug: string; count: number }>> {
  const map = await regionsForPostcodes(postcodes);
  const counts = new Map<string, Region & { slug: string; count: number }>();
  for (const p of postcodes) {
    const r = map.get(p);
    if (!r) continue;
    const slug = regionSlug(r.region_name, r.state);
    const cur = counts.get(slug);
    if (cur) cur.count += 1;
    else counts.set(slug, { ...r, slug, count: 1 });
  }
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.region_name.localeCompare(b.region_name, "en-AU")
  );
}
