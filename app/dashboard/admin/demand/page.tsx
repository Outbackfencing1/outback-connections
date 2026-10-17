// /dashboard/admin/demand — Demand & Market Forecasting Warehouse.
// Combines regional service demand vs. supply, Shopify postcode sales,
// commodity/livestock volume & price tracking, and two-sided Work & Skills
// Board (jobs hiring vs. workers/operators available + ticket supply).
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { commodityLabel, formatAud, priceLine } from "@/lib/sale";
import { ticketLabel } from "@/lib/work-board";
import ForecastCsvExport from "@/components/admin/ForecastCsvExport";
import CopyTextButton from "@/components/admin/CopyTextButton";

export const metadata = {
  title: "Demand & Forecasting — Outback Connections",
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
type MonthRow = {
  month: string;
  enquiries: number;
  requests: number;
  searches: number;
  sales_orders?: number;
  sales_revenue_cents?: number;
};
type Gap = { region_name: string | null; state: string | null; category: string | null; demand: number };
type SalesRegion = {
  region_name: string | null;
  state: string | null;
  sales_orders: number;
  sales_revenue_cents: number;
  demand: number;
  supply: number;
};
type Report = {
  window_months: number;
  by_region: RegionRow[];
  sales_by_region?: SalesRegion[];
  by_month: MonthRow[];
  gaps: Gap[];
  sales_coverage?: { months: number; first_month: string | null; last_month: string | null; updated_at: string | null };
};

type CommodityForecastRow = {
  month: string;
  region_name: string;
  state: string | null;
  category_label: string;
  commodity: string;
  unit: string | null;
  price_type: string;
  listings_count: number;
  for_sale_count?: number;
  wanted_count?: number;
  sold_count: number;
  quantity_listed: number;
  quantity_wanted?: number;
  quantity_sold: number;
  avg_price_cents: number | null;
};

type WorkForecastRow = {
  month: string;
  region_name: string;
  state: string | null;
  role_label: string;
  jobs_hiring: number;
  workers_available: number;
  matched_count: number;
  avg_hourly_aud: number | null;
  avg_daily_aud: number | null;
};

type TicketCountRow = {
  ticket: string;
  workers_count: number;
};

type SearchSignalRow = {
  vertical: string;
  signal: string;
  region_name: string;
  state: string | null;
  searches: number;
  zero_result_searches: number;
};

type SavedAlertRow = {
  vertical: string;
  signal: string;
  region_name: string;
  state: string | null;
  active_subscribers: number;
};

type MarketIntel = {
  window_months: number;
  commodities: CommodityForecastRow[];
  work_board: WorkForecastRow[];
  tickets: TicketCountRow[];
  search_signals?: SearchSignalRow[];
  saved_alerts?: SavedAlertRow[];
};

const aud = (cents: number) => formatAud(cents, { whole: true });

const WINDOWS = [3, 6, 12] as const;

function formatSignalLabel(vertical: string, signal: string): string {
  if (signal === "all") return `All ${vertical}`;
  if (vertical === "job") {
    if (signal === "available_for_work") return "Workers & operators available";
    if (signal === "hiring") return "Farms & businesses hiring";
    return ticketLabel(signal);
  }
  if (vertical === "sale") {
    if (signal === "supply") return "For sale (Available)";
    if (signal === "demand") return "Wanted to buy (Chasing)";
    return commodityLabel(signal) ?? signal;
  }
  return signal.replace(/_/g, " ");
}

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
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!(profile?.is_admin || profile?.is_staff)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Demand &amp; Forecasting</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Staff and admins only</p>
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
  let marketIntel: MarketIntel | null = null;
  let err: string | null = null;
  if (!admin) err = "Not configured (service role missing).";
  else {
    const [demandRes, intelRes] = await Promise.all([
      admin.rpc("admin_demand_by_region", { p_months: months }),
      admin.rpc("admin_market_intelligence", { p_months: months }),
    ]);
    if (demandRes.error) err = demandRes.error.message;
    else report = demandRes.data as Report;
    if (!intelRes.error && intelRes.data) {
      marketIntel = intelRes.data as MarketIntel;
    }
  }

  const label = (r: { region_name: string | null; state: string | null }) =>
    r.region_name ? `${r.region_name}${r.state ? `, ${r.state}` : ""}` : "Unknown region";

  // Build "Unmet Demand — Post This on Facebook Today" hotlist items
  const hotlist: Array<{
    badge: string;
    headline: string;
    detail: string;
    fbPost: string;
  }> = [];

  if (marketIntel?.commodities) {
    for (const c of marketIntel.commodities) {
      const wanted = c.wanted_count ?? 0;
      const forSale = c.for_sale_count ?? c.listings_count;
      if (wanted > 0 && forSale === 0) {
        const commName = commodityLabel(c.commodity) ?? c.category_label;
        const reg = label(c);
        const vol =
          (c.quantity_wanted ?? 0) > 0
            ? `${Number(c.quantity_wanted).toLocaleString("en-AU")}${c.unit ? ` ${c.unit}` : ""}`
            : `${wanted} buyer listing${wanted === 1 ? "" : "s"}`;
        hotlist.push({
          badge: "Wanted to Buy Shortage",
          headline: `${commName} wanted in ${reg}`,
          detail: `${vol} wanted · 0 listed for sale`,
          fbPost: `CHASING ${commName.toUpperCase()} IN ${reg.toUpperCase()} 🌾🐄\n\nWe have buyers on Outback Connections actively chasing ${commName} (${vol}) around ${reg} right now with zero local lots listed.\n\nGot some in the shed or paddock? List it free in 60 seconds so buyers can contact you direct:\nhttps://www.outbackconnections.com.au/post/sale`,
        });
      }
    }
  }

  if (marketIntel?.work_board) {
    for (const w of marketIntel.work_board) {
      if (w.jobs_hiring > 0 && w.workers_available === 0) {
        const reg = label(w);
        hotlist.push({
          badge: "Worker / Operator Shortage",
          headline: `${w.role_label} needed in ${reg}`,
          detail: `${w.jobs_hiring} job${w.jobs_hiring === 1 ? "" : "s"} hiring · 0 workers listed`,
          fbPost: `WORK AVAILABLE: ${w.role_label.toUpperCase()} NEEDED AROUND ${reg.toUpperCase()} 🚜🔧\n\nFarms & rural businesses have ${w.jobs_hiring} open ${w.role_label} role${w.jobs_hiring === 1 ? "" : "s"} on Outback Connections in ${reg} right now.\n\nLooking for work or know an operator with tickets? Put your skills up free or check the board:\nhttps://www.outbackconnections.com.au/jobs`,
        });
      }
    }
  }

  if (marketIntel?.search_signals) {
    for (const s of marketIntel.search_signals) {
      if (s.zero_result_searches > 0) {
        const sigName = formatSignalLabel(s.vertical, s.signal);
        const reg = label(s);
        const postUrl =
          s.vertical === "job"
            ? "https://www.outbackconnections.com.au/post/job"
            : s.vertical === "sale"
              ? "https://www.outbackconnections.com.au/post/sale"
              : "https://www.outbackconnections.com.au/post/freight";
        hotlist.push({
          badge: "Zero-Result Search Gap",
          headline: `${sigName} searched in ${reg}`,
          detail: `${s.zero_result_searches} search${s.zero_result_searches === 1 ? "" : "es"} found 0 listings`,
          fbPost: `ANYONE AROUND ${reg.toUpperCase()} GOT ${sigName.toUpperCase()}? 👀\n\nFarmers have been searching Outback Connections for ${sigName} in ${reg} this week and coming up empty.\n\nIf you can help out, list it free here so locals can find you:\n${postUrl}`,
        });
      }
    }
  }

  if (report?.gaps) {
    for (const g of report.gaps.slice(0, 6)) {
      const reg = label(g);
      const cat = g.category ?? "Rural Contractors";
      hotlist.push({
        badge: "Contractor / Service Gap",
        headline: `${cat} needed in ${reg}`,
        detail: `${g.demand} farmer enquiry/search · 0 listed`,
        fbPost: `CALLING ${cat.toUpperCase()} AROUND ${reg.toUpperCase()} 🛠️\n\nLandholders around ${reg} are looking for ${cat} on Outback Connections right now.\n\nList your business or crew free so local farmers can get in touch direct:\nhttps://www.outbackconnections.com.au/post/service`,
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Demand &amp; Market Forecasting</h1>
        <Link href="/dashboard/admin/analytics" className="text-sm underline">← Analytics</Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Regional demand, livestock &amp; crop supply vs wanted-to-buy &amp; sold volume, rural
        worker/operator availability, live search signals, saved alerts, and Shopify sales correlation. Aggregate
        only; nobody&apos;s personal details are shown here.
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

      {/* Unmet Demand — Post This on Facebook Today Hotlist */}
      <section className="mt-8 rounded-2xl border border-amber-300 bg-amber-50/70 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-900">
              3M/Month Facebook Reach · Actionable Supply Shortages
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-neutral-900">
              Unmet Demand — &ldquo;Post This on Facebook Today&rdquo; Hotlist
            </h2>
            <p className="mt-1 text-xs text-neutral-700">
              Automatic call-outs generated from Wanted-to-Buy shortages, unfilled jobs, and zero-result searches. Click to copy a ready-made Facebook post.
            </p>
          </div>
        </div>
        {hotlist.length === 0 ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-white p-4 text-xs text-neutral-600">
            No immediate zero-supply shortages detected in this window yet — or click the general Facebook call-out below to drive fresh listings:
            <span className="mt-2 block">
              <CopyTextButton
                label="Copy General Facebook Marketplace Call-Out"
                text={`GOT HAY, STOCK, GEAR OR LOOKING FOR RURAL WORK? 🚜🌾🐄\n\nInstead of posts getting lost in the Facebook feed, put your listing or skills up free on Outback Connections so farmers, drivers and contractors can search by postcode, tickets and commodity:\n\n👉 Browse or post free: https://www.outbackconnections.com.au`}
              />
            </span>
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {hotlist.slice(0, 8).map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-xl border border-amber-200 bg-white p-3.5 shadow-sm"
              >
                <div>
                  <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                    {item.badge}
                  </span>
                  <p className="mt-1.5 text-sm font-bold text-neutral-900">{item.headline}</p>
                  <p className="mt-0.5 text-xs text-neutral-600">{item.detail}</p>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2.5">
                  <CopyTextButton text={item.fbPost} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Crops, Hay & Livestock Market Intelligence */}
      {marketIntel && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Crops, hay, grain &amp; livestock (by region &amp; month)
              </h2>
              <p className="mt-1 text-xs text-neutral-600">
                Tracks what stock, hay, grain and gear is listed For Sale vs Wanted to Buy vs Sold,
                where, when, and at what average price.
              </p>
            </div>
            {marketIntel.commodities.length > 0 && (
              <ForecastCsvExport
                filename={`outback-commodities-forecast-${months}m.csv`}
                label="Export Commodities CSV"
                headers={[
                  "Month",
                  "Region",
                  "State",
                  "Category",
                  "Commodity",
                  "Unit",
                  "Price Type",
                  "For Sale Count",
                  "Wanted Count",
                  "Sold Count",
                  "Quantity For Sale",
                  "Quantity Wanted",
                  "Quantity Sold",
                  "Avg Price (AUD)",
                ]}
                rows={marketIntel.commodities.map((c) => [
                  c.month,
                  c.region_name,
                  c.state ?? "",
                  c.category_label,
                  commodityLabel(c.commodity) ?? c.commodity,
                  c.unit ?? "",
                  c.price_type,
                  c.for_sale_count ?? c.listings_count,
                  c.wanted_count ?? 0,
                  c.sold_count,
                  c.quantity_listed,
                  c.quantity_wanted ?? 0,
                  c.quantity_sold,
                  c.avg_price_cents ? (c.avg_price_cents / 100).toFixed(2) : "",
                ])}
              />
            )}
          </div>
          {marketIntel.commodities.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
              No livestock, hay, grain or gear listings recorded in this window yet. As farmers post on{" "}
              <Link href="/post/sale" className="underline">
                /post/sale
              </Link>{" "}
              and mark items sold, regional volume and price trends populate here automatically.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Commodity / Type</th>
                    <th className="px-3 py-2">For Sale</th>
                    <th className="px-3 py-2">Wanted</th>
                    <th className="px-3 py-2">Sold</th>
                    <th className="px-3 py-2">Vol. for sale</th>
                    <th className="px-3 py-2">Vol. wanted</th>
                    <th className="px-3 py-2">Vol. sold</th>
                    <th className="px-3 py-2">Avg price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {marketIntel.commodities.slice(0, 60).map((c, i) => (
                    <tr
                      key={i}
                      className={(c.wanted_count ?? 0) > 0 && (c.for_sale_count ?? c.listings_count) === 0 ? "bg-amber-50" : ""}
                    >
                      <td className="px-3 py-2 font-medium text-neutral-900">{c.month}</td>
                      <td className="px-3 py-2">{label(c)}</td>
                      <td className="px-3 py-2">{commodityLabel(c.commodity) ?? c.category_label}</td>
                      <td className="px-3 py-2">{c.for_sale_count ?? c.listings_count}</td>
                      <td className="px-3 py-2">{c.wanted_count ?? 0}</td>
                      <td className="px-3 py-2">{c.sold_count}</td>
                      <td className="px-3 py-2">
                        {c.quantity_listed > 0
                          ? `${Number(c.quantity_listed).toLocaleString("en-AU")}${c.unit ? ` ${c.unit}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {(c.quantity_wanted ?? 0) > 0
                          ? `${Number(c.quantity_wanted).toLocaleString("en-AU")}${c.unit ? ` ${c.unit}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {c.quantity_sold > 0
                          ? `${Number(c.quantity_sold).toLocaleString("en-AU")}${c.unit ? ` ${c.unit}` : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {c.avg_price_cents
                          ? priceLine({ price_cents: c.avg_price_cents, price_type: c.price_type, unit: c.unit })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Work & Skills Board Intelligence */}
      {marketIntel && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Work &amp; Skills Board (jobs hiring vs. workers &amp; operators available)
              </h2>
              <p className="mt-1 text-xs text-neutral-600">
                Shows where farms are hiring vs. where drivers, header/machine operators and station hands have listed their skills.
              </p>
            </div>
            {marketIntel.work_board.length > 0 && (
              <ForecastCsvExport
                filename={`outback-work-board-forecast-${months}m.csv`}
                label="Export Work Board CSV"
                headers={[
                  "Month",
                  "Region",
                  "State",
                  "Role",
                  "Jobs Hiring",
                  "Workers Available",
                  "Matched",
                  "Avg Hourly AUD",
                  "Avg Daily AUD",
                ]}
                rows={marketIntel.work_board.map((w) => [
                  w.month,
                  w.region_name,
                  w.state ?? "",
                  w.role_label,
                  w.jobs_hiring,
                  w.workers_available,
                  w.matched_count,
                  w.avg_hourly_aud ?? "",
                  w.avg_daily_aud ?? "",
                ])}
              />
            )}
          </div>
          {marketIntel.tickets.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {marketIntel.tickets.map((t) => (
                <span
                  key={t.ticket}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900"
                >
                  {ticketLabel(t.ticket)}: {t.workers_count} available
                </span>
              ))}
            </div>
          )}
          {marketIntel.work_board.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
              No job or worker skill listings in this window yet.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-3 py-2">Month</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Jobs hiring</th>
                    <th className="px-3 py-2">Workers available</th>
                    <th className="px-3 py-2">Matched</th>
                    <th className="px-3 py-2">Avg $/hr</th>
                    <th className="px-3 py-2">Avg $/day</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {marketIntel.work_board.slice(0, 60).map((w, i) => (
                    <tr key={i} className={w.jobs_hiring > 0 && w.workers_available === 0 ? "bg-amber-50" : ""}>
                      <td className="px-3 py-2 font-medium text-neutral-900">{w.month}</td>
                      <td className="px-3 py-2">{label(w)}</td>
                      <td className="px-3 py-2">{w.role_label}</td>
                      <td className="px-3 py-2">{w.jobs_hiring}</td>
                      <td className="px-3 py-2">{w.workers_available}</td>
                      <td className="px-3 py-2">{w.matched_count}</td>
                      <td className="px-3 py-2">{w.avg_hourly_aud ? `$${w.avg_hourly_aud}/hr` : "—"}</td>
                      <td className="px-3 py-2">{w.avg_daily_aud ? `$${w.avg_daily_aud}/day` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Live Search Signals (Skills, Crops & Livestock Searched) */}
      {marketIntel?.search_signals && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Live search signals (what skills, crops &amp; stock people are searching for)
              </h2>
              <p className="mt-1 text-xs text-neutral-600">
                Non-bot searches across Work &amp; Skills, Livestock/Harvest and Freight. Yellow rows
                show searches that returned zero results (immediate supply gaps).
              </p>
            </div>
            {marketIntel.search_signals.length > 0 && (
              <ForecastCsvExport
                filename={`outback-search-signals-${months}m.csv`}
                label="Export Search Signals CSV"
                headers={["Vertical", "Skill / Commodity / Filter", "Region", "State", "Searches", "Zero-Result Searches"]}
                rows={marketIntel.search_signals.map((s) => [
                  s.vertical,
                  formatSignalLabel(s.vertical, s.signal),
                  s.region_name,
                  s.state ?? "",
                  s.searches,
                  s.zero_result_searches,
                ])}
              />
            )}
          </div>
          {marketIntel.search_signals.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
              No non-bot searches recorded for Work &amp; Skills, Livestock/Harvest or Freight in this window yet.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-3 py-2">Board</th>
                    <th className="px-3 py-2">Skill / Commodity / Filter</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Searches</th>
                    <th className="px-3 py-2">Zero-result gaps</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {marketIntel.search_signals.slice(0, 40).map((s, i) => (
                    <tr key={i} className={s.zero_result_searches > 0 ? "bg-amber-50" : ""}>
                      <td className="px-3 py-2 font-medium capitalize text-neutral-900">
                        {s.vertical === "job" ? "Work & Skills" : s.vertical === "sale" ? "Livestock & Harvest" : "Freight"}
                      </td>
                      <td className="px-3 py-2">{formatSignalLabel(s.vertical, s.signal)}</td>
                      <td className="px-3 py-2">{label(s)}</td>
                      <td className="px-3 py-2">{s.searches}</td>
                      <td className="px-3 py-2">{s.zero_result_searches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Saved Search Alerts (Active Buyer & Hiring Subscriptions) */}
      {marketIntel?.saved_alerts && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Active saved search alerts (buyers &amp; farms waiting for a match)
              </h2>
              <p className="mt-1 text-xs text-neutral-600">
                Subscribers who clicked &ldquo;Email me when new matches are posted&rdquo; on Livestock/Harvest, Work &amp; Skills, or Freight.
              </p>
            </div>
            {marketIntel.saved_alerts.length > 0 && (
              <ForecastCsvExport
                filename={`outback-saved-alerts.csv`}
                label="Export Saved Alerts CSV"
                headers={["Board", "Commodity / Role / Filter", "Region", "State", "Active Subscribers"]}
                rows={marketIntel.saved_alerts.map((a) => [
                  a.vertical,
                  formatSignalLabel(a.vertical, a.signal),
                  a.region_name,
                  a.state ?? "",
                  a.active_subscribers,
                ])}
              />
            )}
          </div>
          {marketIntel.saved_alerts.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
              No active search alert subscriptions yet. Every browse page now has a 1-click &ldquo;Email me when new matches are posted&rdquo; box.
            </p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                  <tr>
                    <th className="px-3 py-2">Board</th>
                    <th className="px-3 py-2">Commodity / Role / Filter</th>
                    <th className="px-3 py-2">Region</th>
                    <th className="px-3 py-2">Subscribers waiting</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {marketIntel.saved_alerts.map((a, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium capitalize text-neutral-900">
                        {a.vertical === "job" ? "Work & Skills" : a.vertical === "sale" ? "Livestock & Harvest" : "Freight"}
                      </td>
                      <td className="px-3 py-2">{formatSignalLabel(a.vertical, a.signal)}</td>
                      <td className="px-3 py-2">{label(a)}</td>
                      <td className="px-3 py-2 font-semibold text-green-900">{a.active_subscribers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {report && (
        <>
          <section className="mt-8">
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
            <h2 className="text-lg font-semibold text-neutral-900">Sales next to demand, by region</h2>
            {!report.sales_coverage || report.sales_coverage.months === 0 ? (
              <p className="mt-1 text-sm text-neutral-600">
                No sales data loaded yet.{" "}
                <Link href="/dashboard/admin/sales-upload" className="underline">
                  Upload the Shopify order export
                </Link>{" "}
                and this fills in.
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-neutral-600">
                  Sales cover {report.sales_coverage.first_month} to {report.sales_coverage.last_month}
                  {report.sales_coverage.updated_at ? `, uploaded ${new Date(report.sales_coverage.updated_at).toLocaleDateString("en-AU")}` : ""}.{" "}
                  <Link href="/dashboard/admin/sales-upload" className="underline">Update</Link>. Demand here is all categories combined.
                </p>
                <div className="mt-2 overflow-x-auto rounded-xl border border-neutral-200">
                  <table className="min-w-full divide-y divide-neutral-200 text-sm">
                    <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-600">
                      <tr>
                        <th className="px-3 py-2">Region</th>
                        <th className="px-3 py-2">Orders</th>
                        <th className="px-3 py-2">Revenue</th>
                        <th className="px-3 py-2">Demand on Connections</th>
                        <th className="px-3 py-2">Listed businesses</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {(report.sales_by_region ?? []).slice(0, 60).map((r, i) => (
                        <tr key={i} className={r.demand > 0 && r.sales_orders === 0 ? "bg-green-50" : ""}>
                          <td className="px-3 py-2 font-medium text-neutral-900">{label(r)}</td>
                          <td className="px-3 py-2">{r.sales_orders}</td>
                          <td className="px-3 py-2">{aud(r.sales_revenue_cents)}</td>
                          <td className="px-3 py-2">{r.demand}</td>
                          <td className="px-3 py-2">{r.supply}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  Green rows: farmers are asking on Connections but nothing has sold there yet. Those are the regions to
                  put the trade offer in front of.
                </p>
              </>
            )}
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
                    <th className="px-3 py-2">Orders (sales)</th>
                    <th className="px-3 py-2">Revenue (sales)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {report.by_month.map((m) => (
                    <tr key={m.month}>
                      <td className="px-3 py-2 font-medium text-neutral-900">{m.month}</td>
                      <td className="px-3 py-2">{m.enquiries}</td>
                      <td className="px-3 py-2">{m.requests}</td>
                      <td className="px-3 py-2">{m.searches}</td>
                      <td className="px-3 py-2">{m.sales_orders ?? 0}</td>
                      <td className="px-3 py-2">{aud(m.sales_revenue_cents ?? 0)}</td>
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
                      <td className="px-3 py-2">{r.category ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold">{r.demand}</td>
                      <td className="px-3 py-2">{r.enquiries}</td>
                      <td className="px-3 py-2">{r.requests}</td>
                      <td className="px-3 py-2">{r.searches}</td>
                      <td className="px-3 py-2">{r.zero_result_searches}</td>
                      <td className="px-3 py-2">{r.supply}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Amber rows have demand and zero listed businesses. Quote requests are on a specific listing; job requests
              are a farmer posting what they need; searches are non-bot searches that included a postcode.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
