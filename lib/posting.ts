// lib/posting.ts
// Shared infrastructure for the four posting flows.
// Imported by app/post/{job,freight,service/offering,service/request}/actions.ts
import "server-only";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// Posting guards — caller must be signed in, email verified,
// account ≥ 7 days old. Returns user or a typed rejection.
// ============================================================

export type PostingGuardOk = {
  ok: true;
  userId: string;
  email: string;
  accountAgeDays: number;
};

export type PostingGuardFail =
  | { ok: false; reason: "not_signed_in"; message: string }
  | { ok: false; reason: "email_unverified"; message: string }
  | { ok: false; reason: "account_too_new"; message: string; accountAgeDays: number };

// Hours of account age required before a user can post. Set to 24 after
// audit feedback — 7 days was filtering legitimate signups too aggressively.
const ACCOUNT_AGE_REQUIREMENT_HOURS = 24;

export async function checkPostingGuard(): Promise<PostingGuardOk | PostingGuardFail> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return {
      ok: false,
      reason: "not_signed_in",
      message: "You need to sign in before you can post a listing.",
    };
  }
  const user = data.user;
  if (!user.email_confirmed_at) {
    return {
      ok: false,
      reason: "email_unverified",
      message:
        "Your email address isn't verified yet. Click the link we emailed you, then come back here.",
    };
  }
  const created = new Date(user.created_at).getTime();
  const ageMs = Date.now() - created;
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageHours < ACCOUNT_AGE_REQUIREMENT_HOURS) {
    return {
      ok: false,
      reason: "account_too_new",
      message:
        "Your account needs to be at least 24 hours old before posting. Tomorrow you'll be good to go.",
      accountAgeDays: ageDays,
    };
  }
  return {
    ok: true,
    userId: user.id,
    email: user.email!,
    accountAgeDays: ageDays,
  };
}

// ============================================================
// Slug generator — title-postcode-shortid
// e.g. "station-hand-mudgee-2850-LSTAB12CD"
// The short id comes from the listings.anonymised_id column server-side
// (gen_short_id), so we generate slug AFTER insert. This helper just
// kebabs the title + postcode portion.
// ============================================================

export function kebabize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function buildSlug(title: string, postcode: string, shortId: string): string {
  const titlePart = kebabize(title);
  return `${titlePart}-${postcode}-${shortId}`;
}

// ============================================================
// Latest marketplace policy version
// ============================================================

export async function getLatestPolicyVersionId(): Promise<string | null> {
  const supa = createClient();
  const { data } = await supa
    .from("policy_versions")
    .select("id")
    .in("kind", ["combined", "privacy"])
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ============================================================
// Per-user rate limit: 5 listings posted in last 24h
// ============================================================

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; remaining: 0; message: string };

const POST_RATE_LIMIT = 5;
const POST_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function checkPostingRateLimit(
  userId: string | null
): Promise<RateLimitResult> {
  if (!userId) return { ok: true, remaining: POST_RATE_LIMIT };

  const supa = createAdminClient();
  if (!supa) return { ok: true, remaining: POST_RATE_LIMIT };

  const since = new Date(Date.now() - POST_WINDOW_MS).toISOString();
  const { count, error } = await supa
    .from("listings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);

  if (error) {
    console.error("[rate-limit] listings count error:", error.message);
    return { ok: true, remaining: POST_RATE_LIMIT };
  }

  const used = count ?? 0;
  if (used >= POST_RATE_LIMIT) {
    return {
      ok: false,
      remaining: 0,
      message: `You've posted ${used} listings in the last 24 hours. Daily limit is ${POST_RATE_LIMIT}. Try again tomorrow.`,
    };
  }
  return { ok: true, remaining: POST_RATE_LIMIT - used };
}

// ============================================================
// Flash cookie — one-shot success message read by /dashboard/listings.
// ============================================================

const FLASH_COOKIE = "oc_flash";

export function setFlash(message: string) {
  cookies().set(FLASH_COOKIE, message, {
    maxAge: 60,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export function readAndClearFlash(): string | null {
  const c = cookies();
  const v = c.get(FLASH_COOKIE)?.value ?? null;
  // Only writeable in actions/route handlers; in server components this throws
  try {
    c.delete(FLASH_COOKIE);
  } catch {
    /* read-only context — flash naturally expires in 60s */
  }
  return v;
}

// ============================================================
// Helpers for FormData parsing
// ============================================================

export function clientIp(): string | null {
  const h = headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") || null;
}

export function valuesFrom(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") out[k] = v;
  }
  delete out.website; // never echo back the honeypot
  return out;
}

export function honeypotTripped(formData: FormData): boolean {
  const w = formData.get("website");
  return typeof w === "string" && w.length > 0;
}

// ============================================================
// Zod schemas
// ============================================================

const optionalEnum = <T extends [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.literal("")])
    .transform((v) => (v === "" ? undefined : (v as T[number])));

const optionalNumber = z
  .preprocess((v) => (v === "" || v === undefined ? undefined : Number(v)), z.number().min(0).max(99_999_999).optional());

const optionalDate = z
  .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional());

const baseSchema = z
  .object({
    website: z.string().max(0).optional().default(""), // honeypot
    category_id: z.string().uuid("Pick a category"),
    title: z
      .string()
      .trim()
      .min(5, "Title is too short — at least 5 characters")
      .max(120, "Title is too long — keep it under 120 characters"),
    description: z
      .string()
      .trim()
      .min(30, "Tell us a bit more — at least 30 characters")
      .max(4000, "Please keep the description under 4000 characters"),
    postcode: z.string().regex(/^\d{4}$/, "Postcode must be 4 digits"),
    contact_email: z
      .string()
      .trim()
      .max(255)
      .optional()
      .default("")
      .refine(
        (v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
        "That email doesn't look right"
      ),
    contact_phone: z.string().trim().max(40).optional().default(""),
    contact_best_time: z.string().trim().max(200).optional().default(""),
  })
  .refine(
    (d) => d.contact_email !== "" || d.contact_phone !== "",
    {
      message: "Provide at least an email or a phone number for contact",
      path: ["contact_email"],
    }
  );

export const jobSchema = baseSchema.and(
  z.object({
    work_type: optionalEnum(["full_time", "casual", "contract", "seasonal", "day_rate"]),
    pay_type: optionalEnum(["hourly", "daily", "weekly", "negotiable", "not_specified"]),
    pay_amount: optionalNumber,
    start_date: optionalDate,
    duration_text: z.string().trim().max(200).optional().default(""),
    accommodation_provided: z
      .union([z.literal("on"), z.literal("true"), z.boolean(), z.undefined()])
      .transform((v) => v === true || v === "on" || v === "true"),
  })
);

export const freightSchema = baseSchema.and(
  z.object({
    direction: z.enum(["need_freight", "offering_truck"], {
      errorMap: () => ({ message: "Pick a direction" }),
    }),
    origin_postcode: z
      .union([z.string().regex(/^\d{4}$/, "Origin postcode must be 4 digits"), z.literal("")])
      .optional()
      .default(""),
    destination_postcode: z
      .union([z.string().regex(/^\d{4}$/, "Destination postcode must be 4 digits"), z.literal("")])
      .optional()
      .default(""),
    vehicle_type: optionalEnum([
      "tipper", "livestock", "flatbed", "b_double", "refrigerated", "tray", "other",
    ]),
    cargo_type: optionalEnum([
      "livestock", "grain", "hay_fodder", "machinery", "fuel_water", "refrigerated", "general", "other",
    ]),
    weight_kg: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      z.number().int().min(0).max(1_000_000).optional()
    ),
    pickup_from_date: optionalDate,
    pickup_by_date: optionalDate,
    budget_bracket: optionalEnum([
      "under_1k", "1k_5k", "5k_20k", "20k_50k", "over_50k", "unknown",
    ]),
  })
);

export const serviceSchema = baseSchema.and(
  z.object({
    rate_type: optionalEnum(["hourly", "daily", "fixed", "per_km", "quote", "negotiable"]),
    rate_amount: optionalNumber,
    travel_willingness: optionalEnum([
      "postcode_only", "within_50km", "within_200km", "state_wide", "national",
    ]),
  })
);

// ============================================================
// Insert helper — sequential listings + detail with rollback on failure.
//
// Note: not a true transaction. If detail insert fails we DELETE the
// orphaned listings row to clean up. Acceptable for V1 because Zod has
// already validated the data; the second insert failing is rare.
// Phase 2 might switch to a Postgres function if we observe issues.
// ============================================================

export type InsertResult =
  | { ok: true; slug: string }
  | { ok: false; message: string };

type ListingsInsert = {
  user_id: string;
  kind: "job" | "freight" | "service_offering" | "service_request";
  category_id: string;
  title: string;
  description: string;
  postcode: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_best_time: string | null;
  policy_version_id: string;
  state: string | null;
};

export async function insertListing<DetailRow extends Record<string, unknown>>(
  listing: ListingsInsert,
  detailTable: "job_details" | "freight_details" | "service_details",
  detail: DetailRow
): Promise<InsertResult> {
  const supa = createAdminClient();
  if (!supa) {
    return { ok: false, message: "Listing storage isn't configured. Try again later." };
  }

  // Step 1: insert listings with a placeholder slug (we don't have the
  // anonymised_id until after insert). We'll update the slug immediately.
  const placeholderSlug = `pending-${listing.postcode}-${Math.random().toString(36).slice(2, 10)}`;
  const { data: inserted, error: listingErr } = await supa
    .from("listings")
    .insert({ ...listing, slug: placeholderSlug })
    .select("id, anonymised_id")
    .single();

  if (listingErr || !inserted) {
    console.error("[posting] listings insert failed:", listingErr?.message);
    return { ok: false, message: "Couldn't save the listing. Please try again in a moment." };
  }

  // Step 2: build the real slug + update
  const realSlug = buildSlug(listing.title, listing.postcode, inserted.anonymised_id);
  const { error: slugErr } = await supa
    .from("listings")
    .update({ slug: realSlug })
    .eq("id", inserted.id);

  if (slugErr) {
    console.error("[posting] slug update failed:", slugErr.message);
    await supa.from("listings").delete().eq("id", inserted.id);
    return { ok: false, message: "Couldn't finalise the listing. Please try again." };
  }

  // Step 3: insert detail
  const { error: detailErr } = await supa
    .from(detailTable)
    .insert({ listing_id: inserted.id, ...detail });

  if (detailErr) {
    console.error(`[posting] ${detailTable} insert failed:`, detailErr.message);
    await supa.from("listings").delete().eq("id", inserted.id);
    return { ok: false, message: "Couldn't save the listing details. Please try again." };
  }

  return { ok: true, slug: realSlug };
}

// ============================================================
// Action result type used by all four flows
// ============================================================

export type ActionResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string>; values?: Record<string, string> };

export function zodErrorsToMap(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = String(issue.path[0] ?? "_");
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
