// lib/analytics.ts — SERVER-ONLY capture helpers (Gate 1B).
// Writes to events (append-only) and search_queries via the service role.
// Both await inside try/catch: awaited so serverless doesn't drop the write,
// try/catch so a logging failure NEVER breaks the page. Best-effort by design.
import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

type Json = Record<string, unknown>;

function reqMeta(): { ip: string | null; user_agent: string | null } {
  try {
    const h = headers();
    const xff = h.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0]?.trim() || null : h.get("x-real-ip");
    return { ip: ip || null, user_agent: h.get("user-agent") || null };
  } catch {
    return { ip: null, user_agent: null };
  }
}

/** Append a meaningful action to events. entityId must be a uuid (or null). */
export async function logEvent(args: {
  eventType: string; // e.g. listing_view, contact_reveal, apply_click, claim_attempt
  entityType?: string | null; // listing | business | search | ...
  entityId?: string | null; // uuid
  vertical?: string | null; // job | freight | service | ...
  userId?: string | null;
  properties?: Json;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { ip, user_agent } = reqMeta();
  try {
    await admin.from("events").insert({
      event_type: args.eventType,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      vertical: args.vertical ?? null,
      user_id: args.userId ?? null,
      properties: args.properties ?? {},
      ip,
      user_agent,
    });
  } catch (e) {
    console.error("[analytics] logEvent failed:", e);
  }
}

/** Record a search, including zero-result (result_count = 0) — the demand gap. */
export async function logSearch(args: {
  vertical?: string | null;
  filters?: Json;
  resultCount: number;
  postcode?: string | null;
  regionState?: string | null;
  queryText?: string | null;
  userId?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const { ip, user_agent } = reqMeta();
  try {
    await admin.from("search_queries").insert({
      vertical: args.vertical ?? null,
      filters: args.filters ?? {},
      result_count: args.resultCount,
      postcode: args.postcode ?? null,
      region_state: args.regionState ?? null,
      query_text: args.queryText ?? null,
      user_id: args.userId ?? null,
      ip,
      user_agent,
    });
  } catch (e) {
    console.error("[analytics] logSearch failed:", e);
  }
}
