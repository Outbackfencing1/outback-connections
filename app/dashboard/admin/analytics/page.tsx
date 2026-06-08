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
  let err: string | null = null;
  if (!admin) {
    err = "Analytics unavailable (service role not configured).";
  } else {
    const { data, error } = await admin.rpc("admin_analytics_summary");
    if (error) err = error.message;
    else summary = data as Summary;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <Link href="/dashboard/admin/flags" className="text-sm underline">← Admin</Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Supply, demand and the zero-result gap by vertical and region. Read-only;
        populates as listings are imported and people browse.
      </p>

      {err && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{err}</div>
      )}

      {summary && (
        <div className="mt-8 space-y-8">
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
