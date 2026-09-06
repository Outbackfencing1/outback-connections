// /api/cron/weekly-digest — Monday morning numbers to the team inbox.
// Gate, last-7-days deltas, enquiry queue (with anything waiting >48h),
// directory health, and the demand gaps. Aggregate only. `?dry=1` returns
// the JSON + text without sending. Scheduled in vercel.json (Sunday 21:00 UTC
// = Monday 7am AEST).
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_FROM, NOTIFICATION_TO, sendEmail } from "@/lib/email";
import { formatWeeklyDigest, type DigestData, type DigestWeek } from "@/lib/weekly-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

function authorise(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("k") === secret;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(req: NextRequest) {
  if (!authorise(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });

  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  const [gateRes, demandRes, enqLast7, enqOpen, enqWaiting, outcomes, activeListings, expiring, businesses, pendingClaims] =
    await Promise.all([
      admin.rpc("admin_gate_metrics", { p_weeks: 2 }),
      admin.rpc("admin_demand_by_region", { p_months: 1 }),
      admin.from("listing_enquiries").select("id", { count: "exact", head: true }).neq("status", "spam").gte("created_at", iso(daysAgo(7))),
      admin.from("listing_enquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
      admin.from("listing_enquiries").select("id", { count: "exact", head: true }).eq("status", "new").lte("created_at", iso(daysAgo(2))),
      admin.from("listing_enquiries").select("outcome").not("outcome", "is", null).gte("outcome_at", iso(daysAgo(30))),
      admin.from("listings").select("id", { count: "exact", head: true }).eq("status", "active").gt("expires_at", iso(now)),
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("data_source", "scraped")
        .gt("expires_at", iso(now))
        .lte("expires_at", iso(daysAgo(-14))),
      admin.from("businesses").select("claim_status").eq("status", "active"),
      admin.from("claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

  const gate = (gateRes.data ?? null) as { weeks?: DigestWeek[]; gate?: DigestData["gate"] } | null;
  const weeks = gate?.weeks ?? [];
  const demand = (demandRes.data ?? null) as { gaps?: DigestData["gaps"] } | null;
  const outcomeRows = (outcomes.data ?? []) as { outcome: string }[];
  const bizRows = (businesses.data ?? []) as { claim_status: string }[];

  const data: DigestData = {
    generatedAt: iso(now),
    gate: gate?.gate ?? {
      target_searches_per_week: 25,
      target_claims_30d: 5,
      target_first_party_posts_30d: 10,
      human_searches_7d: 0,
      claims_30d: 0,
      first_party_posts_30d: 0,
      enquiries_30d: 0,
      bot_share_30d_pct: 0,
    },
    thisWeek: weeks[weeks.length - 1] ?? null,
    lastWeek: weeks.length >= 2 ? weeks[weeks.length - 2] : null,
    enquiries: {
      last7d: enqLast7.count ?? 0,
      open: enqOpen.count ?? 0,
      waitingOver48h: enqWaiting.count ?? 0,
      answered30d: outcomeRows.length,
      responded30d: outcomeRows.filter((r) => r.outcome === "responded").length,
    },
    directory: {
      active: activeListings.count ?? 0,
      unclaimed: bizRows.filter((b) => b.claim_status === "unclaimed").length,
      claimed: bizRows.filter((b) => b.claim_status !== "unclaimed").length,
      expiring14d: expiring.count ?? 0,
      pendingClaims: pendingClaims.count ?? 0,
    },
    gaps: demand?.gaps ?? [],
    baseUrl: BASE_URL,
  };

  const { subject, text } = formatWeeklyDigest(data);

  if (req.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({ ok: true, dry: true, subject, text, data });
  }

  const sent = await sendEmail({
    to: NOTIFICATION_TO,
    from: DEFAULT_FROM,
    subject,
    text,
    html: `<pre style="font-family:-apple-system,system-ui,sans-serif;white-space:pre-wrap;">${escapeHtml(text)}</pre>`,
  });
  return NextResponse.json({ ok: sent.ok, subject, errors: [gateRes.error?.message, demandRes.error?.message].filter(Boolean) });
}
