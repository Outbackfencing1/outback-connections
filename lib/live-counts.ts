// lib/live-counts.ts
// How many active, unexpired listings a browse page has, for noindex
// decisions in generateMetadata. Returns null on any error so a database
// blip never noindexes a real page (see browseRobots in lib/seo.ts).
import { createAnonClient } from "./supabase/anon";
import { isRuralPostcode } from "./rural-postcodes";

export async function liveListingCount(filter: {
  kinds: string[];
  categoryId?: string;
  /** Limit to these postcodes (a region page). */
  postcodes?: string[];
}): Promise<number | null> {
  try {
    let query = createAnonClient()
      .from("listings")
      .select("id, postcode, state")
      .in("kind", filter.kinds)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
    if (filter.postcodes) query = query.in("postcode", filter.postcodes);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return null;
    return data.filter((r) => isRuralPostcode(r.postcode, r.state)).length;
  } catch {
    return null;
  }
}
