// /dashboard/admin/demand — what farmers ask for, where, and whether anyone
// is listed to do it. Josh's planning view: quote requests + job requests +
// located human searches per region and category, against current supply,
// with the gaps (demand, no supply) called out. Aggregate only.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Demand by region — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type RegionRow = {
  region_name: string | null;
  state: string | null;
  category: string | null;
  enquiries: number;
  requests: number;
  searches: number;
  zero_result_searches: number;
  supply: number;
  demand: number;
};
type MonthRow = { month: string; enquiries: number; requests: number; searches: number };
type Gap = { region_name: string | null; state: string | null; category: string | null; demand: number };
type Report = { window_months: number; by_region: RegionRow[]; by_month: MonthRow[]; gaps: Gap[] };

const WINDOWS = [3, 6, 12] as const;

export default async function DemandPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/demand");
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Demand by region</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Admins only</p>
        </div>
      </div>
    );
  }

  const months = (() => {
    const n = parseInt(typeof sp.months === "string" ? sp.months : "6", 10);
    return (WINDOWS as readonly number[]).includes(n) ? n : 6;
  })();

  const admin = createAdminClient();
  let report: Report | null = null;
  let err: string | null = null;
  if (!admin) err = "Not configured (service role missing).";
  else {
    const { data, error } = await admin.rpc("admin_demand_by_region", { p_months: months });
    if (error) err = error.message;
    else report = data as Report;
  }

  const label = (r: { region_name: string | null; state: string | null }) =>
    r.region_name ? `${r.region_name}${r.state ? `, ${r.state}` : ""}` : "Unknown region";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Demand by region</h1>
        <Link href="/dashboard/admin/analytics" className="text-sm underline">← Analytics</Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        What people asked for, where, and whether anyone is listed to do it. Demand = quote
        requests + job requests + human searches with a postcode. Supply = live service
        listings. Aggregate only; nobody&apos;s details are on this page.
      </p>

      <nav className="mt-4 flex gap-2 text-xs">
        {WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/dashboard/admin/demand?months=${w}`}
            className={`rounded-full border px-3 py-1 ${
              months === w ? "border-green-700 bg-green-50 text-green-900" : "border-neutral-300 text-neutral-700"
            }`}
          >
            Last {w} months
          </Link>
        ))}
      </nav>

      {err && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div>
      )}

      {report && (
        <>
          <section className="mt-6">
            <h2 className="text-lg font-semibold text-neutral-900">Gaps: asked for, nobody listed</h2>
            {report.gaps.length === 0 ? (
              <p className="mt-1 text-sm text-neutral-600">None in this window. Every located ask had at least one listing.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                {report.gaps.slice(0, 30).map((g, i) => (
                  <li key={i} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-900">
                    {g.category ?? "any category"} · {label(g)} <span className="text-amber-700">({g.demand})</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-neutral-500">
              These are the categories and regions to seed next. Each one is a farmer who looked and found nothing.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-neutral-900">By month</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2">Quote requests</th>
                    <th className="px-3 py-2">Job requests</th>
                    <th className="px-3 py-2">Located searches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {report.by_month.map((m) => (
                    <tr key={m.month}>
                      <td className="px-3 py-2 font-medium text-neutral-900">{m.month}</td>
                      <td className="px-3 py-2">{m.enquiries}</td>
                      <td className="px-3 py-2">{m.requests}</td>
                      <td className="px-3 py-2">{m.searches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-neutral-900">By region and category</h2>
            <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Demand</th>
                    <th className="px-3 py-2">Quotes</th>
                    <th className="px-3 py-2">Job requests</th>
                    <th className="px-3 py-2">Searches</th>
                    <th className="px-3 py-2">Found nothing</th>
                    <th className="px-3 py-2">Supply</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {report.by_region.slice(0, 100).map((r, i) => (
                    <tr key={i} className={r.supply === 0 && r.demand > 0 ? "bg-amber-50" : ""}>
                      <td className="px-3 py-2 font-medium text-neutral-900">{label(r)}</td>
                      <td className="px-3 py-2 text-neutral-700">{r.category ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold">{r.demand}</td>
                      <td className="px-3 py-2">{r.enquiries}</td>
                      <td className="px-3 py-2">{r.requests}</td>
                      <td className="px-3 py-2">{r.searches}</td>
                      <td className="px-3 py-2 text-neutral-600">{r.zero_result_searches}</td>
                      <td className="px-3 py-2">{r.supply}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Highlighted rows have demand and no supply. &quot;Found nothing&quot; is searches that returned
              zero results. Searches without a postcode aren&apos;t located and don&apos;t appear here.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
