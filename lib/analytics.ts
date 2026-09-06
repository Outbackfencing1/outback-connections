// lib/analytics.ts — SERVER-ONLY capture helpers (Gate 1B).
// Writes to events (append-only) and search_queries via the service role.
// Both await inside try/catch: awaited so serverless doesn't drop the write,
// try/catch so a logging failure NEVER breaks the page. Best-effort by design.
import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

type Json = Record<string, unknown>;

// Mirrors the backfill regex in migration 20260906050000. Crawlers are kept
// (they're useful for SEO debugging) but flagged so the gate numbers are humans.
const BOT_UA =
  /(bot|crawl|spider|slurp|gptbot|claudebot|anthropic|perplexity|bingpreview|facebookexternalhit|headless|python-requests|curl[/]|go-http-client|vercel-screenshot|lighthouse|pagespeed|dataforseo|semrush|ahrefs|mj12|petalbot|yandex|baiduspider|duckduckbot|applebot|amazonbot|bytespider|ccbot|scrapy|httpx|axios|node-fetch|okhttp|java[/]|wget)/i;

export function isBotUserAgent(ua: string | null): boolean {
  if (!ua) return true; // no UA at all is never a browser
  return BOT_UA.test(ua);
}

/**
 * Pseudonymous daily session key: sha256(ip | user agent | UTC date). No
 * cookie, no new data (ip + ua are already stored), rotates every day, and
 * lets "distinct people this week" be counted honestly.
 */
function sessionHash(ip: string | null, ua: string | null): string | null {
  if (!ip && !ua) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip ?? ""}|${ua ?? ""}|${day}`).digest("hex").slice(0, 32);
}

async function reqMeta(): Promise<{
  ip: string | null;
  user_agent: string | null;
  is_bot: boolean;
  session_id: string | null;
}> {
  try {
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    const ip = xff ? xff.split(",")[0]?.trim() || null : h.get("x-real-ip");
    const ua = h.get("user-agent") || null;
    return { ip: ip || null, user_agent: ua, is_bot: isBotUserAgent(ua), session_id: sessionHash(ip || null, ua) };
  } catch {
    return { ip: null, user_agent: null, is_bot: true, session_id: null };
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
  const { ip, user_agent, is_bot, session_id } = await reqMeta();
  try {
    await admin.from("events").insert({
      event_type: args.eventType,
      entity_type: args.entityType ?? null,
      entity_id: args.entityId ?? null,
      vertical: args.vertical ?? null,
      user_id: args.userId ?? null,
      session_id,
      properties: args.properties ?? {},
      ip,
      user_agent,
      is_bot,
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
  const { ip, user_agent, is_bot, session_id } = await reqMeta();
  try {
    await admin.from("search_queries").insert({
      vertical: args.vertical ?? null,
      filters: args.filters ?? {},
      result_count: args.resultCount,
      postcode: args.postcode ?? null,
      region_state: args.regionState ?? null,
      query_text: args.queryText ?? null,
      user_id: args.userId ?? null,
      session_id,
      ip,
      user_agent,
      is_bot,
    });
  } catch (e) {
    console.error("[analytics] logSearch failed:", e);
  }
}
