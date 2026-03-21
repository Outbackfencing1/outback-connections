// app/dashboard/page.tsx
import { auth } from "@/auth";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { FencingCalculator } from "./fencing-calculator";

export const metadata = { title: "Dashboard – Outback Ops" };

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

async function getStats() {
  const supa = supabaseServer();
  if (!supa) return null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [customers, quotesMonth, ordersMonth, activities] = await Promise.all([
    supa.from("customers").select("*", { count: "exact", head: true }),
    supa.from("quotes").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supa.from("orders").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supa
      .from("customer_activities")
      .select("id, customer_id, type, notes, created_at, customers(name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  return {
    customerCount: customers.count ?? 0,
    quotesCount: quotesMonth.count ?? 0,
    ordersCount: ordersMonth.count ?? 0,
    recentActivity: activities.data ?? [],
  };
}

export default async function DashboardPage() {
  const session = await auth();
  const name = session?.user?.name?.split(" ")[0] ?? "there";
  const stats = await getStats();

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Dashboard header */}
      <div className="bg-neutral-900 border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-amber-500 tracking-wide">OUTBACK OPS</h1>
              <p className="text-xs text-neutral-400">Fencing &amp; Steel Supplies</p>
            </div>
            <p className="text-sm text-neutral-300">
              {getGreeting()}, <span className="font-medium text-white">{name}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Fencing Calculator — front and centre */}
        <FencingCalculator />

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Customers" value={stats ? formatNum(stats.customerCount) : "\u2014"} />
          <StatCard label="Quotes This Month" value={stats ? formatNum(stats.quotesCount) : "\u2014"} />
          <StatCard label="Orders This Month" value={stats ? formatNum(stats.ordersCount) : "\u2014"} />
          <StatCard label="Open Jobs" value="\u2014" sub="Coming soon" />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Recent Activity</h2>
            {stats && stats.recentActivity.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {stats.recentActivity.map((a: any) => (
                  <li key={a.id} className="flex items-start gap-3">
                    <ActivityIcon type={a.type} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-neutral-900 truncate">
                        <span className="font-medium">{(a.customers as any)?.name ?? "Customer"}</span>
                        {" \u2014 "}
                        <span className="text-neutral-600">{a.notes || a.type}</span>
                      </p>
                      <p className="text-xs text-neutral-400">
                        {new Date(a.created_at).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-neutral-500">No recent activity.</p>
            )}
          </div>

          {/* Action Items */}
          <div className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">Action Items</h2>
            <div className="mt-4 space-y-3">
              <ActionPlaceholder label="Overdue follow-ups" />
              <ActionPlaceholder label="Unpaid invoices" />
              <ActionPlaceholder label="Quotes expiring soon" />
            </div>
            <p className="mt-4 text-xs text-neutral-400">
              Automated tracking coming soon.
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickAction href="/dashboard/post-a-job" label="New Quote" icon={<DocPlusIcon />} />
          <QuickAction href="/dashboard/profile" label="Add Customer" icon={<UserPlusIcon />} />
          <QuickAction href="/dashboard/opportunities" label="Browse Jobs" icon={<SearchIcon />} />
          <QuickAction href="/pricing" label="Pricing" icon={<TagIcon />} />
        </div>

        {!session && (
          <div className="rounded-lg border bg-amber-50 border-amber-200 p-4">
            <p className="text-sm text-amber-800">
              You&apos;re not signed in. Some features are unavailable.{" "}
              <Link href="/login" className="font-semibold underline underline-offset-2">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function formatNum(n: number): string {
  return n.toLocaleString("en-AU");
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}

function ActionPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-neutral-100 bg-neutral-50 px-4 py-3">
      <span className="text-sm text-neutral-700">{label}</span>
      <span className="text-xs text-neutral-400">&mdash;</span>
    </div>
  );
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm hover:border-amber-300 hover:shadow-md transition text-center"
    >
      <div className="text-neutral-600">{icon}</div>
      <span className="text-sm font-medium text-neutral-700">{label}</span>
    </Link>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const cls = "mt-0.5 w-4 h-4 shrink-0";
  if (type === "quote" || type === "quote_created")
    return <svg className={`${cls} text-amber-500`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
  if (type === "order" || type === "order_placed")
    return <svg className={`${cls} text-green-600`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  return <svg className={`${cls} text-neutral-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>;
}

/* ---------- SVG Icons ---------- */

function DocPlusIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}

function UserPlusIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m3-3h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>;
}

function SearchIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
}

function TagIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>;
}
