// /api/cron/weekly-digest — Monday morning numbers to the team inbox.
// Gate, last-7-days deltas, enquiry queue (with anything waiting >48h),
// directory health, and the demand gaps. Aggregate only. `?dry=1` returns
// the JSON + text without sending. Scheduled in vercel.json (Sunday 21:00 UTC
// = Monday 7am AEST). If the metrics RPCs fail, nothing is sent: a wrong
// email is worse than a missing one.
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authoriseCron } from "@/lib/cron-auth";
import { DEFAULT_FROM, NOTIFICATION_TO, escapeHtml, sendEmail } from "@/lib/email";
import { formatWeeklyDigest, type DigestData, type DigestWeek } from "@/lib/weekly-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

export async function GET(req: NextRequest) {
  if (!authoriseCron(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "admin_unavailable" }, { status: 500 });

  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
  const enq = () => admin.from("listing_enquiries").select("id", { count: "exact", head: true });
  const biz = () => admin.from("businesses").select("id", { count: "exact", head: true }).eq("status", "active");

  const [gateRes, demandRes, enqLast7, enqOpen, enqWaiting, outcomes, activeListings, expiring, unclaimed, claimed, pendingClaims] =
    await Promise.all([
      admin.rpc("admin_gate_metrics", { p_weeks: 3 }),
      admin.rpc("admin_demand_by_region", { p_months: 1 }),
      enq().neq("status", "spam").gte("created_at", iso(daysAgo(7))),
      enq().eq("status", "new"),
      enq().eq("status", "new").lte("created_at", iso(daysAgo(2))),
      admin.from("listing_enquiries").select("outcome").not("outcome", "is", null).gte("outcome_at", iso(daysAgo(30))).limit(1000),
      admin.from("listings").select("id", { count: "exact", head: true }).eq("status", "active").gt("expires_at", iso(now)),
      admin
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .eq("data_source", "scraped")
        .gt("expires_at", iso(now))
        .lte("expires_at", iso(daysAgo(-14))),
      biz().eq("claim_status", "unclaimed"),
      biz().neq("claim_status", "unclaimed"),
      admin.from("claims").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);

  if (gateRes.error || demandRes.error) {
    console.error("[weekly-digest] metrics failed:", gateRes.error?.message, demandRes.error?.message);
    return NextResponse.json(
      { ok: false, error: "metrics_failed", details: [gateRes.error?.message, demandRes.error?.message].filter(Boolean) },
      { status: 500 }
    );
  }

  const gate = gateRes.data as { weeks?: DigestWeek[]; gate?: DigestData["gate"]; verified_since?: string | null };
  if (!gate?.gate) return NextResponse.json({ ok: false, error: "gate_shape" }, { status: 500 });
  // A week that started in the last 24 hours has nothing in it yet; report the
  // last completed week instead (matters when the cron is run by hand on Monday).
  const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
  const weeks = (gate.weeks ?? []).filter((w) => new Date(w.week_start).getTime() <= cutoff);
  const demand = demandRes.data as { gaps?: DigestData["gaps"] };
  const outcomeRows = (outcomes.data ?? []) as { outcome: string }[];

  const data: DigestData = {
    generatedAt: iso(now),
    gate: gate.gate,
    verifiedSince: gate.verified_since ?? null,
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
      unclaimed: unclaimed.count ?? 0,
      claimed: claimed.count ?? 0,
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
  return NextResponse.json({ ok: sent.ok, subject });
}
