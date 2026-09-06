// /dashboard/admin/analytics — read-only owner analytics. Supply vs demand vs
// zero-result by vertical/region, engagement events, trust ladder. Admins only.
// Populates after imports + traffic. No writes.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Analytics — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Summary = {
  listings_by_vertical_side: { vertical: string; side: string; n: number }[];
  listings_by_state: { state: string; vertical: string; n: number }[];
  searches_total: number;
  searches_zero: number;
  zero_by_vertical: { vertical: string; zero: number; total: number }[];
  events_by_type: { event_type: string; n: number }[];
  businesses_by_claim: { claim_status: string; n: number }[];
  funnel: {
    jobs_live: number;
    jobs_expired: number;
    jobs_stale: number;
    listing_views: number;
    source_clicks: number;
    source_click_rate_pct: number;
    search_volume: number;
    zero_result: number;
    claim_starts: number;
    claims_approved: number;
    claimed_businesses: number;
  };
};

type GateWeek = {
  week_start: string;
  human_searches: number;
  human_browse_loads: number;
  human_sessions: number;
  claims: number;
  first_party_posts: number;
  signups: number;
  listing_views: number;
  contact_reveals: number;
  source_clicks: number;
  enquiries: number;
  directory_adds: number;
};

type GateMetrics = {
  weeks: GateWeek[];
  gate: {
    target_searches_per_week: number;
    target_claims_30d: number;
    target_first_party_posts_30d: number;
    human_searches_7d: number;
    claims_30d: number;
    first_party_posts_30d: number;
    enquiries_30d: number;
    bot_share_30d_pct: number;
  };
};

export default async function AnalyticsPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/analytics");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Admins only</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/dashboard" className="underline">← Back to dashboard</Link>
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  let summary: Summary | null = null;
  let gate: GateMetrics | null = null;
  let err: string | null = null;
  if (!admin) {
    err = "Analytics unavailable (service role not configured).";
  } else {
    const [s, g] = await Promise.all([
      admin.rpc("admin_analytics_summary"),
      admin.rpc("admin_gate_metrics", { p_weeks: 8 }),
    ]);
    if (s.error) err = s.error.message;
    else summary = s.data as Summary;
    if (!g.error) gate = g.data as GateMetrics;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <Link href="/dashboard/admin/flags" className="text-sm underline">← Admin</Link>
      </div>

      {gate && <GateBlock gate={gate} />}
      <p className="mt-2 text-sm text-neutral-700">
        Supply, demand and the zero-result gap by vertical and region. Read-only;
        populates as listings are imported and people browse.
      </p>

      {err && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      {summary && (
        <div className="mt-8 space-y-8">
          <Section title="Funnel" subtitle="Jobs directory + engagement (collection layer — raw counts, not a data product yet).">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Jobs live" value={summary.funnel.jobs_live} />
              <Stat label="Expired" value={summary.funnel.jobs_expired} />
              <Stat label="Stale" value={summary.funnel.jobs_stale} />
              <Stat label="Claimed businesses" value={summary.funnel.claimed_businesses} />
              <Stat label="Listing views" value={summary.funnel.listing_views} />
              <Stat label="Source clicks" value={summary.funnel.source_clicks} />
              <Stat label="Source-click rate" value={`${summary.funnel.source_click_rate_pct}%`} />
              <Stat label="Searches" value={summary.funnel.search_volume} />
              <Stat label="Zero-result" value={summary.funnel.zero_result} />
              <Stat label="Claim starts" value={summary.funnel.claim_starts} />
              <Stat label="Claims approved" value={summary.funnel.claims_approved} />
            </div>
          </Section>

          <Section title="Supply vs demand (active listings)">
            <Table
              cols={["Vertical", "Side", "Count"]}
              rows={summary.listings_by_vertical_side.map((r) => [r.vertical, r.side, String(r.n)])}
            />
          </Section>

          <Section title="By region (active listings)">
            <Table
              cols={["State", "Vertical", "Count"]}
              rows={summary.listings_by_state.map((r) => [r.state, r.vertical, String(r.n)])}
            />
          </Section>

          <Section
            title="Demand gap (searches)"
            subtitle={`${summary.searches_zero} of ${summary.searches_total} searches returned zero results.`}
          >
            <Table
              cols={["Vertical", "Zero-result", "Total", "Zero %"]}
              rows={summary.zero_by_vertical.map((r) => [
                r.vertical,
                String(r.zero),
                String(r.total),
                r.total > 0 ? `${Math.round((r.zero / r.total) * 100)}%` : "—",
              ])}
            />
          </Section>

          <Section title="Engagement (events)">
            <Table
              cols={["Event", "Count"]}
              rows={summary.events_by_type.map((r) => [r.event_type, String(r.n)])}
            />
          </Section>

          <Section title="Trust ladder (active businesses)">
            <Table
              cols={["Claim status", "Count"]}
              rows={summary.businesses_by_claim.map((r) => [r.claim_status, String(r.n)])}
            />
          </Section>
        </div>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">← Back to dashboard</Link>
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-2xl font-bold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-neutral-600">{label}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-neutral-600">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-neutral-500">No data yet — populates after imports + traffic.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-neutral-200">
      <table className="min-w-full divide-y divide-neutral-200 text-sm">
        <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
          <tr>{cols.map((c) => <th key={c} className="px-3 py-2">{c}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={j === 0 ? "px-3 py-2 font-medium text-neutral-900" : "px-3 py-2 text-neutral-700"}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------
// Traction gate (Josh, 4 Jul 2026): 25 organic human searches/week,
// 5 claim submissions and 10 first-party posts within 30 days of the
// Facebook push. Humans only (crawlers flagged by user agent). A "search"
// is a browse load with a query or a filter set; bare loads are shown too.
// ------------------------------------------------------------
function GateBlock({ gate }: { gate: GateMetrics }) {
  const g = gate.gate;
  const chip = (label: string, value: number, target: number) => (
    <div
      className={`rounded-xl border p-4 ${
        value >= target ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">
        {value}
        <span className="text-sm font-normal text-neutral-500"> / {target}</span>
      </p>
    </div>
  );
  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-neutral-900">Traction gate</h2>
      <p className="mt-1 text-xs text-neutral-600">
        Humans only. Crawlers were {g.bot_share_30d_pct}% of browse loads in the last 30 days.
        A search is a browse load with a category, region, postcode, filter or query chosen;
        bare loads of /services, /jobs or /freight are not counted.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {chip("Human searches, last 7 days", g.human_searches_7d, g.target_searches_per_week)}
        {chip("Claims, last 30 days", g.claims_30d, g.target_claims_30d)}
        {chip("First-party posts, last 30 days", g.first_party_posts_30d, g.target_first_party_posts_30d)}
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">Quote requests, last 30 days</p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">{g.enquiries_30d ?? 0}</p>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
            <tr>
              <th className="px-3 py-2">Week of</th>
              <th className="px-3 py-2">Searches</th>
              <th className="px-3 py-2">Browse loads</th>
              <th className="px-3 py-2">People</th>
              <th className="px-3 py-2">Listing views</th>
              <th className="px-3 py-2">Contact reveals</th>
              <th className="px-3 py-2">Source clicks</th>
              <th className="px-3 py-2">Quote requests</th>
              <th className="px-3 py-2">Signups</th>
              <th className="px-3 py-2">Claims</th>
              <th className="px-3 py-2">1st-party posts</th>
              <th className="px-3 py-2">Directory adds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {gate.weeks.map((w) => (
              <tr key={w.week_start}>
                <td className="px-3 py-2 font-medium text-neutral-900">{w.week_start}</td>
                <td className="px-3 py-2">{w.human_searches}</td>
                <td className="px-3 py-2 text-neutral-600">{w.human_browse_loads}</td>
                <td className="px-3 py-2">{w.human_sessions}</td>
                <td className="px-3 py-2">{w.listing_views}</td>
                <td className="px-3 py-2">{w.contact_reveals}</td>
                <td className="px-3 py-2">{w.source_clicks}</td>
                <td className="px-3 py-2">{w.enquiries ?? 0}</td>
                <td className="px-3 py-2">{w.signups}</td>
                <td className="px-3 py-2">{w.claims}</td>
                <td className="px-3 py-2">{w.first_party_posts}</td>
                <td className="px-3 py-2 text-neutral-600">{w.directory_adds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        &quot;People&quot; is distinct daily visitors (hash of address + browser + day; no cookie).
        Source clicks are people leaving to the business&apos;s own page, the directory&apos;s
        version of an enquiry.
      </p>
    </section>
  );
}
