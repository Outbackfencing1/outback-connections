import { unstable_cache } from "next/cache";
import { createAnonClient } from "./supabase/anon";

export type Pillar = "services" | "jobs" | "freight";

export type CategoryCounts = Record<string, number>;

export type PillarStats = {
  total: number;
  categoriesUsed: number;
  byCategory: CategoryCounts;
};

export type CountsByPillar = Record<Pillar, PillarStats>;

async function fetchCountsByPillar(): Promise<CountsByPillar> {
  const supabase = createAnonClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("listings")
    .select("category_id, category:categories!inner(pillar)")
    .eq("status", "active")
    .gt("expires_at", nowIso);

  const empty = (): PillarStats => ({ total: 0, categoriesUsed: 0, byCategory: {} });
  const out: CountsByPillar = {
    services: empty(),
    jobs: empty(),
    freight: empty(),
  };

  if (error) {
    console.error("[category-counts] fetch failed:", error.message);
    return out;
  }

  for (const row of data ?? []) {
    const cat = Array.isArray(row.category) ? row.category[0] : row.category;
    const pillar = cat?.pillar as Pillar | undefined;
    if (!pillar || !(pillar in out)) continue;
    const bucket = out[pillar];
    bucket.total += 1;
    if (row.category_id) {
      bucket.byCategory[row.category_id] =
        (bucket.byCategory[row.category_id] ?? 0) + 1;
    }
  }
  for (const key of Object.keys(out) as Pillar[]) {
    out[key].categoriesUsed = Object.keys(out[key].byCategory).length;
  }
  return out;
}

/**
 * Cached for 60s. One query for the whole site, sliced per pillar by callers.
 * Uses the anon client (no cookies) so the cache key isn't muddied by the
 * request-scoped session.
 */
export const getCountsByPillar = unstable_cache(
  fetchCountsByPillar,
  ["category-counts-by-pillar-v1"],
  { revalidate: 60, tags: ["category-counts"] }
);

export async function getCategoryCounts(pillar: Pillar): Promise<PillarStats> {
  const all = await getCountsByPillar();
  return all[pillar];
}
