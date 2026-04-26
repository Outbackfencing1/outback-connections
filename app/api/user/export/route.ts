// app/api/user/export/route.ts
// Right-of-access endpoint (APP 12). Generates a JSON export of everything
// tied to the calling user, signs a 7-day download token, emails the link,
// and logs the request.
//
// POST: triggers export. Auth: either session cookie (user-initiated) or
// internal call header (when invoked by the privacy dashboard server action).
// Rate-limit: 1 per 24 hours.
//
// GET ?token=...: serves the JSON blob for the download URL we email out.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signToken, verifyToken } from "@/lib/signed-tokens";
import { sendEmail } from "@/lib/email";
import { sendThrottledEmail } from "@/lib/email-throttle";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

async function gatherExport(userId: string, admin: ReturnType<typeof createAdminClient>) {
  if (!admin) throw new Error("admin client unavailable");

  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [profile, listings, flagsSubmitted, flagsAgainst, defamationFiled, exports, authEvents] =
    await Promise.all([
      admin.from("user_profiles").select("*").eq("user_id", userId).maybeSingle(),
      admin
        .from("listings")
        .select(
          `*,
          job_details(*),
          freight_details(*),
          service_details(*)`
        )
        .eq("user_id", userId),
      admin
        .from("listing_flags")
        .select("anonymised_id, reason, note, created_at, listing_id")
        .eq("flagged_by", userId),
      admin
        .from("listing_flags")
        .select("anonymised_id, reason, created_at, listing:listings!inner(id, title, user_id)")
        .eq("listing.user_id", userId),
      admin
        .from("defamation_complaints")
        .select(
          "anonymised_id, type_of_concern, notice_type, received_at, action_taken, listing:listings!inner(id, title, user_id)"
        )
        .eq("listing.user_id", userId),
      admin
        .from("data_export_requests")
        .select("anonymised_id, requested_at, completed_at, status, expires_at")
        .eq("user_id", userId),
      admin
        .from("auth_events")
        .select("event_type, created_at, ip, user_agent")
        .eq("user_id", userId)
        .gte("created_at", ninetyDaysAgo)
        .order("created_at", { ascending: false }),
    ]);

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    user_id: userId,
    profile: profile.data,
    listings: listings.data ?? [],
    flags_submitted: flagsSubmitted.data ?? [],
    flags_against_my_listings: flagsAgainst.data ?? [],
    defamation_complaints_against_my_listings: defamationFiled.data ?? [],
    previous_export_requests: exports.data ?? [],
    auth_events_last_90_days: authEvents.data ?? [],
    notes: [
      "This export is your data per APP 12. If anything is wrong, request correction at help@outbackconnections.com.au.",
      "Auth events are limited to the last 90 days; older events are auto-purged.",
      "Aggregate counts: " +
        `${(listings.data ?? []).length} listings, ` +
        `${(flagsSubmitted.data ?? []).length} flags submitted, ` +
        `${(authEvents.data ?? []).length} auth events.`,
    ],
  };
}

export async function POST(request: NextRequest) {
  const internalSecret = request.headers.get("x-internal-call");
  const internalUserId = request.headers.get("x-user-id");
  const isInternalCall =
    !!process.env.URL_SIGNING_SECRET &&
    internalSecret === process.env.URL_SIGNING_SECRET &&
    !!internalUserId;

  let userId: string;
  let userEmail: string | null = null;

  if (isInternalCall) {
    userId = internalUserId!;
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin.auth.admin.getUserById(userId);
      userEmail = data.user?.email ?? null;
    }
  } else {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    userId = data.user.id;
    userEmail = data.user.email ?? null;
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  }

  // Rate limit (skip for internal call since the action already checked).
  if (!isInternalCall) {
    const since = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
    const { count } = await admin
      .from("data_export_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("requested_at", since)
      .neq("status", "failed");
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "rate_limited", retry_after_hours: 24 },
        { status: 429 }
      );
    }
    await admin.from("data_export_requests").insert({
      user_id: userId,
      delivered_to_email: userEmail,
      status: "pending",
    });
  }

  let blob: Awaited<ReturnType<typeof gatherExport>>;
  try {
    blob = await gatherExport(userId, admin);
  } catch (e) {
    console.error("[export] gather failed:", e);
    await admin
      .from("data_export_requests")
      .update({ status: "failed" })
      .eq("user_id", userId)
      .eq("status", "pending");
    return NextResponse.json({ error: "gather_failed" }, { status: 500 });
  }

  const json = JSON.stringify(blob, null, 2);
  const byteSize = Buffer.byteLength(json, "utf8");

  const token = signToken({ p: "export", u: userId, ttlMs: TOKEN_TTL_MS });
  const downloadUrl = `${BASE_URL}/api/user/export?token=${encodeURIComponent(token)}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await admin
    .from("data_export_requests")
    .update({
      completed_at: new Date().toISOString(),
      status: userEmail ? "delivered" : "generated",
      download_token: token,
      expires_at: expiresAt,
      byte_size: byteSize,
    })
    .eq("user_id", userId)
    .eq("status", "pending");

  if (userEmail) {
    const subject = "Your Outback Connections data export";
    const text = `Your data export is ready.

Download (valid for 7 days):
${downloadUrl}

The download is a JSON file containing every record we hold tied to your account, including profile fields, listings, flags you've submitted, defamation complaints filed against your listings, and the last 90 days of sign-in events.

Why am I getting this?
You requested a data export from /dashboard/privacy. This is your right under Australian Privacy Principle 12.

If you didn't request this, contact help@outbackconnections.com.au immediately.

— Outback Connections
Outback Fencing & Steel Supplies Pty Ltd
76 Astill Drive, Orange NSW 2800
Privacy: ${BASE_URL}/privacy
Terms: ${BASE_URL}/terms`;

    const html = `<p>Your data export is ready.</p>
<p><a href="${downloadUrl}">Download your data (JSON)</a></p>
<p>Link valid for 7 days.</p>
<p>The file contains every record we hold tied to your account, including profile fields, listings, flags you've submitted, defamation complaints filed against your listings, and the last 90 days of sign-in events.</p>
<p><strong>Why am I getting this?</strong><br>You requested a data export from <code>/dashboard/privacy</code>. This is your right under Australian Privacy Principle 12.</p>
<p>If you didn't request this, contact <a href="mailto:help@outbackconnections.com.au">help@outbackconnections.com.au</a> immediately.</p>
<hr>
<p style="font-size: 12px; color: #666;">Outback Connections — Outback Fencing & Steel Supplies Pty Ltd<br>
76 Astill Drive, Orange NSW 2800<br>
<a href="${BASE_URL}/privacy">Privacy</a> · <a href="${BASE_URL}/terms">Terms</a></p>`;

    await sendThrottledEmail({
      to: userEmail,
      subject,
      text,
      html,
    });
  }

  return NextResponse.json({
    ok: true,
    bytes: byteSize,
    expires_at: expiresAt,
    delivered: !!userEmail,
  });
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }
  const verified = verifyToken(token);
  if (!verified.ok || verified.payload.p !== "export") {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });
  }
  const blob = await gatherExport(verified.payload.u, admin);
  return new NextResponse(JSON.stringify(blob, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="outback-connections-export-${verified.payload.u.slice(0, 8)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
