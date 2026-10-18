// lib/posting.ts
// Shared infrastructure for the four posting flows.
// Imported by app/post/{job,freight,service/offering,service/request}/actions.ts
import "server-only";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listingHref } from "./format";
import { dollarsToCents, parseProofBadges, PRICE_TYPES } from "@/lib/sale";
import { JOB_DIRECTIONS, parseWorkerTickets, TRAVEL_RADII } from "@/lib/work-board";
import { DEFAULT_FROM, sendEmail } from "@/lib/email";
import { isValidAustralianAbn, normaliseAbn } from "@/lib/trust";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export const PENDING_VERIFICATION_CONFIRMATION =
  "Your listing is saved and queued! Confirm your email/phone or ABN to publish immediately, or our team will approve it shortly.";

// ============================================================
// Posting guards — caller must be signed in (and not in lockdown).
// Newly registered or unverified users are allowed to submit immediately;
// their listing is saved as `pending_review` unless fast-tracked by ABN.
// ============================================================

export type PostingGuardOk = {
  ok: true;
  userId: string;
  email: string;
  accountAgeDays: number;
  emailVerified: boolean;
};

export type PostingGuardFail =
  | { ok: false; reason: "not_signed_in"; message: string }
  | { ok: false; reason: "email_unverified"; message: string }
  | { ok: false; reason: "account_too_new"; message: string; accountAgeDays: number }
  | { ok: false; reason: "lockdown"; message: string };

export type PostingGuardOptions = {
  /** Retained for backwards compatibility; all signed-in users may now submit
   *  immediately (queued for verification if newly registered / unverified). */
  skipAccountAge?: boolean;
};

export async function checkPostingGuard(
  _opts: PostingGuardOptions = {}
): Promise<PostingGuardOk | PostingGuardFail> {
  // Lockdown short-circuit. Lookup is cached for 30s.
  const { getLockdownState } = await import("./lockdown");
  const lockdown = await getLockdownState();
  if (lockdown.active) {
    return {
      ok: false,
      reason: "lockdown",
      message:
        "Posting is temporarily disabled while we investigate an issue. Please check back shortly.",
    };
  }
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
  const created = new Date(user.created_at).getTime();
  const ageMs = Date.now() - created;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  return {
    ok: true,
    userId: user.id,
    email: user.email!,
    accountAgeDays: ageDays,
    emailVerified: Boolean(user.email_confirmed_at),
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

export async function setFlash(message: string): Promise<void> {
  (await cookies()).set(FLASH_COOKIE, message, {
    maxAge: 60,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function readAndClearFlash(): Promise<string | null> {
  const c = await cookies();
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

export async function clientIp(): Promise<string | null> {
  const h = await headers();
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
  const tickets = formData
    .getAll("tickets")
    .filter((t): t is string => typeof t === "string" && t.trim() !== "");
  if (tickets.length > 0) {
    out.tickets = tickets.join(",");
  }
  const proofBadges = formData
    .getAll("proof_badges")
    .filter((p): p is string => typeof p === "string" && p.trim() !== "");
  if (proofBadges.length > 0) {
    out.proof_badges = proofBadges.join(",");
  }
  delete out.website; // never echo back the honeypot
  return out;
}

export function formDataToRecord(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = Object.fromEntries(formData.entries());
  const tickets = formData.getAll("tickets");
  if (tickets.length > 0) {
    out.tickets = tickets;
  }
  const proofBadges = formData.getAll("proof_badges");
  if (proofBadges.length > 0) {
    out.proof_badges = proofBadges;
  }
  return out;
}

export function honeypotTripped(formData: FormData): boolean {
  const w = formData.get("website");
  return typeof w === "string" && w.length > 0;
}

// ============================================================
// Zod schemas
// ============================================================

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
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
    abn: z
      .string()
      .trim()
      .max(30)
      .optional()
      .default("")
      .refine(
        (v) => v === "" || isValidAustralianAbn(v),
        "Enter a valid 11-digit Australian Business Number (ABN), or leave blank"
      ),
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
    direction: z
      .union([z.enum(JOB_DIRECTIONS), z.literal("")])
      .optional()
      .transform((v) => (v === "available_for_work" ? "available_for_work" : "hiring")),
    work_type: optionalEnum(["full_time", "casual", "contract", "seasonal", "day_rate"]),
    pay_type: optionalEnum(["hourly", "daily", "weekly", "negotiable", "not_specified"]),
    pay_amount: optionalNumber,
    start_date: optionalDate,
    duration_text: z.string().trim().max(200).optional().default(""),
    accommodation_provided: z
      .union([z.literal("on"), z.literal("true"), z.boolean(), z.undefined()])
      .transform((v) => v === true || v === "on" || v === "true"),
    tickets: z
      .unknown()
      .optional()
      .transform((v) => parseWorkerTickets(v)),
    travel_willingness: optionalEnum(TRAVEL_RADII),
    experience_years: z.preprocess(
      (v) => (v === "" || v === undefined ? undefined : Number(v)),
      z.number().int().min(0).max(80).optional()
    ),
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

export const saleSchema = baseSchema
  .and(
    z.object({
      side: z
        .union([z.enum(["supply", "demand"]), z.literal("")])
        .optional()
        .transform((v): "supply" | "demand" => (v === "demand" ? "demand" : "supply")),
      price: z.string().trim().max(20).optional().default(""),
      price_type: z.enum(PRICE_TYPES, { errorMap: () => ({ message: "Pick a price type" }) }),
      quantity: z.preprocess(
        (v) => (v === "" || v === undefined ? undefined : Number(v)),
        z.number().min(0).max(1_000_000).optional()
      ),
      unit: z.string().trim().max(30).optional().default(""),
      condition: optionalEnum(["new", "used", "na"]),
      delivery: optionalEnum(["pickup", "can_deliver", "either"]),
      sub_category: z.string().trim().max(60).optional().default(""),
      harvest_season: z.string().trim().max(60).optional().default(""),
      proof_badges: z
        .unknown()
        .optional()
        .transform((v) => parseProofBadges(v)),
    })
  )
  .superRefine((d, ctx) => {
    const cents = dollarsToCents(d.price);
    if (cents === "invalid") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Price: numbers only, like 1250 or 85.50" });
    }
    const needsPrice = d.price_type === "fixed" || d.price_type.startsWith("per_");
    if (needsPrice && cents === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["price"], message: "Give a price, or pick negotiable / price on application" });
    }
  });

// ============================================================
// Insert helper — sequential listings + detail with rollback on failure.
// ============================================================

export type InsertResult =
  | { ok: true; slug: string; pendingVerification: boolean }
  | { ok: false; message: string };

type ListingsInsert = {
  user_id: string;
  kind: "job" | "freight" | "service_offering" | "service_request" | "for_sale";
  side?: "supply" | "demand";
  category_id: string;
  title: string;
  description: string;
  postcode: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_best_time: string | null;
  policy_version_id: string;
  state: string | null;
  /** User's account email — used to send the first-listing email on success */
  user_email?: string;
  /** Optional 11-digit ABN submitted on the posting form to fast-track trust */
  abn?: string | null;
  /** Whether the user's email address is confirmed */
  email_verified?: boolean;
  /** Account age in days */
  account_age_days?: number;
};

export async function insertListing<DetailRow extends Record<string, unknown>>(
  listing: ListingsInsert,
  detailTable: "job_details" | "freight_details" | "service_details" | "sale_details",
  detail: DetailRow
): Promise<InsertResult> {
  const supa = createAdminClient();
  if (!supa) {
    return { ok: false, message: "Listing storage isn't configured. Try again later." };
  }

  // Strip helper fields before inserting — they are not columns on listings
  const {
    user_email: _user_email,
    side: explicitSide,
    abn: rawAbn,
    email_verified: emailVerified,
    account_age_days: accountAgeDays,
    ...listingRow
  } = listing;

  const cleanAbn = normaliseAbn(rawAbn);
  if (cleanAbn) {
    // Fast-track user profile ABN verification when a valid 11-digit ABN is provided
    await supa
      .from("user_profiles")
      .upsert(
        {
          user_id: listing.user_id,
          abn: cleanAbn,
          abn_verified: true,
        },
        { onConflict: "user_id" }
      );
  }

  const { data: userProfile } = await supa
    .from("user_profiles")
    .select("is_admin, phone_verified, abn_verified, abn")
    .eq("user_id", listing.user_id)
    .maybeSingle();

  const hasFastTrackTrust = Boolean(
    cleanAbn ||
      userProfile?.is_admin ||
      userProfile?.abn_verified ||
      userProfile?.phone_verified
  );

  const isEstablishedVerifiedAccount =
    emailVerified !== false && (accountAgeDays ?? 7) >= 7;

  const shouldQueueForVerification = !hasFastTrackTrust && !isEstablishedVerifiedAccount;
  const initialStatus = shouldQueueForVerification ? "pending_review" : "active";

  // Spine classification (Migration 2). vertical derives from kind; side is the
  // market side of the resource transacted. For job and freight, side comes from
  // the detail row's direction (available_for_work / offering_truck => supply,
  // hiring / need_freight => demand).
  const vertical =
    listing.kind === "for_sale"
      ? "sale"
      : listing.kind === "freight"
      ? "freight"
      : listing.kind === "job"
        ? "job"
        : "service";
  const side =
    explicitSide ??
    (listing.kind === "for_sale"
      ? "supply"
      : listing.kind === "job"
      ? (detail as { direction?: string }).direction === "available_for_work"
        ? "supply"
        : "demand"
      : listing.kind === "service_offering"
        ? "supply"
        : listing.kind === "service_request"
          ? "demand"
          : (detail as { direction?: string }).direction === "offering_truck"
            ? "supply"
            : "demand"); // freight: need_freight => demand

  // Step 1: insert listings with a placeholder slug (we don't have the
  // anonymised_id until after insert). We'll update the slug immediately.
  const placeholderSlug = `pending-${listing.postcode}-${Math.random().toString(36).slice(2, 10)}`;
  const { data: inserted, error: listingErr } = await supa
    .from("listings")
    .insert({
      ...listingRow,
      slug: placeholderSlug,
      vertical,
      side,
      status: initialStatus,
    })
    .select("id, anonymised_id, expires_at")
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

  if (shouldQueueForVerification) {
    void notifyAdminPendingListing({
      listingId: inserted.id,
      title: listing.title,
      kind: listing.kind,
      postcode: listing.postcode,
      slug: realSlug,
      userEmail: listing.user_email ?? listing.contact_email ?? "unknown",
      contactPhone: listing.contact_phone,
    });
  } else {
    // Item 11: best-effort first-listing email (no-op if not first)
    if (listing.user_email) {
      void sendFirstListingEmail({
        userEmail: listing.user_email,
        userId: listing.user_id,
        listingTitle: listing.title,
        listingKind: listing.kind,
        slug: realSlug,
        expiresAt: inserted.expires_at,
      });
    }

    // Best-effort: notify any saved search alerts matching this vertical/postcode/signal
    void notifyMatchingSearchAlerts({
      vertical,
      postcode: listing.postcode,
      title: listing.title,
      kind: listing.kind,
      slug: realSlug,
      detail: detail as Record<string, unknown>,
    });
  }

  return {
    ok: true,
    slug: realSlug,
    pendingVerification: shouldQueueForVerification,
  };
}

async function notifyAdminPendingListing(args: {
  listingId: string;
  title: string;
  kind: "job" | "freight" | "service_offering" | "service_request" | "for_sale";
  postcode: string;
  slug: string;
  userEmail: string;
  contactPhone: string | null;
}): Promise<void> {
  try {
    const adminTo =
      process.env.ADMIN_ALERT_EMAIL ||
      process.env.SUPPORT_EMAIL ||
      "support@outbackconnections.com.au";
    const queueUrl = `${BASE_URL}/dashboard/admin/flags`;
    const listingUrl = `${BASE_URL}${listingHref(args.kind, args.slug)}`;
    await sendEmail({
      to: adminTo,
      from: DEFAULT_FROM,
      subject: `[Verification Queue] New listing queued: ${args.title} (${args.postcode})`,
      text: [
        `A newly registered user submitted a listing into the verification queue (pending_review):`,
        ``,
        `Title: ${args.title}`,
        `Kind: ${args.kind}`,
        `Postcode: ${args.postcode}`,
        `User email: ${args.userEmail}`,
        `Phone: ${args.contactPhone ?? "—"}`,
        ``,
        `Review & approve in Admin Queue: ${queueUrl}`,
        `Listing URL: ${listingUrl}`,
      ].join("\n"),
      html: `<p>A newly registered user submitted a listing into the verification queue (<code>pending_review</code>):</p><ul><li><strong>Title:</strong> ${escapeHtml(args.title)}</li><li><strong>Kind:</strong> ${escapeHtml(args.kind)}</li><li><strong>Postcode:</strong> ${escapeHtml(args.postcode)}</li><li><strong>User email:</strong> ${escapeHtml(args.userEmail)}</li><li><strong>Phone:</strong> ${escapeHtml(args.contactPhone ?? "—")}</li></ul><p><a href="${queueUrl}"><strong>Approve in Admin Queue →</strong></a></p>`,
    });
  } catch (e) {
    console.error("[posting] admin pending-listing notification failed:", e);
  }
}

async function notifyMatchingSearchAlerts(args: {
  vertical: "job" | "sale" | "freight" | "service";
  postcode: string;
  title: string;
  kind: "job" | "freight" | "service_offering" | "service_request" | "for_sale";
  slug: string;
  detail: Record<string, unknown>;
}): Promise<void> {
  try {
    const supa = createAdminClient();
    if (!supa) return;

    const { data: alerts } = await supa
      .from("search_alerts")
      .select("id, email, signal, postcode, notified_count")
      .eq("vertical", args.vertical)
      .eq("active", true)
      .limit(30);

    if (!alerts || alerts.length === 0) return;

    const signalsOnListing = new Set<string>(["all"]);
    if (typeof args.detail.sub_category === "string" && args.detail.sub_category) {
      signalsOnListing.add(args.detail.sub_category);
    }
    if (typeof args.detail.direction === "string" && args.detail.direction) {
      signalsOnListing.add(args.detail.direction);
    }
    if (typeof args.detail.vehicle_type === "string" && args.detail.vehicle_type) {
      signalsOnListing.add(args.detail.vehicle_type);
    }
    if (Array.isArray(args.detail.tickets)) {
      for (const t of args.detail.tickets) {
        if (typeof t === "string") signalsOnListing.add(t);
      }
    }

    const link = `${BASE_URL}${listingHref(args.kind, args.slug)}`;
    for (const a of alerts) {
      const postcodeMatches =
        !a.postcode ||
        a.postcode === args.postcode ||
        args.postcode.startsWith(a.postcode.slice(0, 2));
      const signalMatches =
        !a.signal || a.signal === "all" || signalsOnListing.has(a.signal);
      if (!postcodeMatches || !signalMatches) continue;

      await sendEmail({
        to: a.email,
        from: DEFAULT_FROM,
        subject: `New match on Outback Connections: ${args.title}`,
        text: `G'day,\n\nA new listing matching your alert was just posted near postcode ${args.postcode}:\n\n${args.title}\n${link}\n\n— Outback Connections\n${BASE_URL}`,
        html: `<p>G'day,</p><p>A new listing matching your alert was just posted near postcode <strong>${escapeHtml(args.postcode)}</strong>:</p><p><a href="${link}"><strong>${escapeHtml(args.title)}</strong></a></p><p>— Outback Connections</p>`,
      });

      await supa
        .from("search_alerts")
        .update({
          notified_count: (a.notified_count ?? 0) + 1,
          last_notified_at: new Date().toISOString(),
        })
        .eq("id", a.id);
    }
  } catch (e) {
    console.error("[search-alerts] notification error:", e);
  }
}

// ============================================================
// Item 11: post-confirmation email on first listing.
// Best-effort. Fires after a successful insert. Only sends if this is
// the user's first listing.
// ============================================================

export async function sendFirstListingEmail(args: {
  userEmail: string;
  userId: string;
  listingTitle: string;
  listingKind: "job" | "freight" | "service_offering" | "service_request" | "for_sale";
  slug: string;
  expiresAt: string | Date;
}): Promise<void> {
  const supa = createAdminClient();
  if (!supa) return;

  // Count user's listings — only send on the first one
  const { count } = await supa
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", args.userId);

  if (count !== 1) return; // not the first

  const path = listingHref(args.listingKind, args.slug);
  const link = `${BASE_URL}${path}`;
  const expiresStr = (typeof args.expiresAt === "string" ? new Date(args.expiresAt) : args.expiresAt)
    .toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const text = [
    `G'day,`,
    ``,
    `Your first listing is live on Outback Connections:`,
    `${args.listingTitle}`,
    `${link}`,
    ``,
    `It'll stay up until ${expiresStr}, then expire unless you renew.`,
    ``,
    `Want more responses? A few things that help:`,
    `- Make the title specific. "Station hand wanted, near Mudgee, fencing experience" beats "need a hand".`,
    `- Add the postcode, a price range, and best contact times if you can.`,
    `- Reply to people quickly — the early responders are usually the keenest.`,
    ``,
    `When you've found someone (or didn't), mark the listing as filled in your dashboard:`,
    `${BASE_URL}/dashboard/listings`,
    ``,
    `That helps us improve the platform without invading anyone's privacy.`,
    ``,
    `If something looks off, reply to this email — a real person reads it.`,
    ``,
    `— Outback Connections`,
    `${BASE_URL}`,
  ].join("\n");

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,system-ui,sans-serif;max-width:600px;margin:0 auto;padding:16px;color:#111;line-height:1.5;">
<p>G'day,</p>
<p>Your first listing is live on Outback Connections:</p>
<p><a href="${link}"><strong>${escapeHtml(args.listingTitle)}</strong></a></p>
<p>It'll stay up until <strong>${expiresStr}</strong>, then expire unless you renew.</p>
<p>Want more responses? A few things that help:</p>
<ul>
  <li>Make the title specific. "Station hand wanted, near Mudgee, fencing experience" beats "need a hand".</li>
  <li>Add the postcode, a price range, and best contact times if you can.</li>
  <li>Reply to people quickly — the early responders are usually the keenest.</li>
</ul>
<p>When you've found someone (or didn't), <a href="${BASE_URL}/dashboard/listings">mark the listing as filled in your dashboard</a>. That helps us improve the platform without invading anyone's privacy.</p>
<p>If something looks off, reply to this email — a real person reads it.</p>
<p style="margin-top:24px;color:#888;font-size:0.9em;">— Outback Connections<br>${BASE_URL}</p>
</body></html>`;

  try {
    await sendEmail({
      to: args.userEmail,
      from: DEFAULT_FROM,
      subject: "Your listing is live on Outback Connections",
      text,
      html,
    });
  } catch (e) {
    console.error("[posting] first-listing email failed:", e);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
