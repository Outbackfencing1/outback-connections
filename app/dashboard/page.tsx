// app/dashboard/page.tsx
import { auth } from "@/auth";
import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";
import { FencingCalculator } from "./fencing-calculator";

export const metadata = { title: "Dashboard – Outback Connections" };

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

async function getStats() {
  const supa = supabaseServer();
  if (!supa) return null;

  const [jobsRes, contractorsRes, freightRes] = await Promise.all([
    supa.from("jobs").select("*", { count: "exact", head: true }),
    supa.from("profiles").select("*", { count: "exact", head: true }),
    supa.from("freight_listings").select("*", { count: "exact", head: true }),
  ]);

  return {
    jobsCount: jobsRes.count ?? 0,
    contractorsCount: contractorsRes.count ?? 0,
    freightCount: freightRes.count ?? 0,
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
              <p className="text-xs text-neutral-400">Jobs, Freight &amp; Opportunities</p>
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
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total Jobs Posted" value={stats ? formatNum(stats.jobsCount) : "\u2014"} />
          <StatCard label="Contractors Registered" value={stats ? formatNum(stats.contractorsCount) : "\u2014"} />
          <StatCard label="Freight Listings" value={stats ? formatNum(stats.freightCount) : "\u2014"} />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <QuickAction href="/dashboard/post-a-job" label="Post a Job" icon={<DocPlusIcon />} />
          <QuickAction href="/dashboard/post-freight" label="Post Freight" icon={<TruckIcon />} />
          <QuickAction href="/dashboard/opportunities" label="Browse Jobs" icon={<SearchIcon />} />
          <QuickAction href="/dashboard/profile" label="My Profile" icon={<UserPlusIcon />} />
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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
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

/* ---------- SVG Icons ---------- */

function DocPlusIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
}

function TruckIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0H6.375c-.621 0-1.125-.504-1.125-1.125v-3.659a1.125 1.125 0 01.328-.794l3.1-3.1a1.125 1.125 0 01.795-.329H13.5m7.125 7.5V12m0 0V5.625A1.125 1.125 0 0019.5 4.5h-6.75a1.125 1.125 0 00-1.125 1.125v12m8.25-6h-2.25m0 0h-2.25" /></svg>;
}

function UserPlusIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m3-3h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>;
}

function SearchIcon() {
  return <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>;
}
