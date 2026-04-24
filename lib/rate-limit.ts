// lib/rate-limit.ts
// Per-IP rate limiting for user-submitted forms.
// Uses the existing consent_ip columns as counters, so no new infra.
// Fails OPEN (allows submission) on DB errors or missing env, because a
// broken rate-limit check must not block a rural user from getting help.

// Step 5 will generalise this into a reusable checkListingPostRateLimit
// against the listings table. For now the body is unchanged; only the
// import path moves to the new admin-client module.
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitOk = { ok: true; remaining: number };
export type RateLimitDenied = { ok: false; remaining: 0; retryAfterMinutes: number; message: string };
export type RateLimitResult = RateLimitOk | RateLimitDenied;

type Options = {
  windowMs?: number;
  max?: number;
};

const DEFAULTS = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
};

async function countRecent(
  table: "help_requests" | "complaints_private",
  ip: string,
  windowMs: number
): Promise<number | null> {
  const supa = createAdminClient();
  if (!supa) return null;

  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await supa
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("consent_ip", ip)
    .gte("created_at", since);

  if (error) {
    console.error(`[rate-limit] ${table} count failed, failing open:`, error.message);
    return null;
  }
  return count ?? 0;
}

export async function checkHelpRateLimit(
  ip: string | null,
  opts: Options = {}
): Promise<RateLimitResult> {
  const { windowMs, max } = { ...DEFAULTS, ...opts };

  if (!ip || ip === "unknown") {
    // No usable IP — fail open, but log so we notice if this becomes common.
    console.warn("[rate-limit] no IP header, allowing submission");
    return { ok: true, remaining: max };
  }

  const used = await countRecent("help_requests", ip, windowMs);
  if (used === null) return { ok: true, remaining: max };

  if (used >= max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMinutes: Math.ceil(windowMs / 60000),
      message:
        "You've sent a few messages recently. Give us an hour to read them, then try again. If it's urgent, call the Rural Financial Counselling Service on 1800 686 175.",
    };
  }
  return { ok: true, remaining: max - used };
}

export async function checkReportRateLimit(
  ip: string | null,
  opts: Options = {}
): Promise<RateLimitResult> {
  const { windowMs, max } = { ...DEFAULTS, ...opts };
  if (!ip || ip === "unknown") return { ok: true, remaining: max };

  const used = await countRecent("complaints_private", ip, windowMs);
  if (used === null) return { ok: true, remaining: max };

  if (used >= max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMinutes: Math.ceil(windowMs / 60000),
      message:
        "You've sent a few reports recently. Give us an hour to read them, then try again.",
    };
  }
  return { ok: true, remaining: max - used };
}
