// lib/live-counts.ts
// How many active, unexpired listings a browse page has, for noindex
// decisions in generateMetadata. Returns null on any error so a database
// blip never noindexes a real page (see browseRobots in lib/seo.ts).
import { createAnonClient } from "./supabase/anon";

export async function liveListingCount(filter: {
  kinds: string[];
  categoryId?: string;
}): Promise<number | null> {
  try {
    let query = createAnonClient()
      .from("listings")
      .select("id", { count: "exact", head: true })
      .in("kind", filter.kinds)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());
    if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
    const { count, error } = await query;
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}
