// /dashboard/admin/sales-upload — feed the forecasting join. Upload the
// Shopify "Export orders" CSV (or an aggregated month/postcode/orders/revenue
// sheet); it is collapsed to aggregate monthly rows per postcode in the
// browser and only those rows are sent. Nothing personal is uploaded.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStaffAccess } from "@/lib/staff-access";
import { createAdminClient } from "@/lib/supabase/admin";
import SalesUploadForm from "./SalesUploadForm";

export const metadata = {
  title: "Sales upload — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SalesUploadPage() {
  const access = await getStaffAccess();
  if (!access.ok && access.reason === "not_signed_in") redirect("/signin?next=/dashboard/admin/sales-upload");
  if (!access.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Sales upload</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Staff and admins only</p>
        </div>
      </div>
    );
  }

  const admin = createAdminClient();
  let coverage: { months: number; first: string | null; last: string | null; rows: number; updated: string | null } = {
    months: 0, first: null, last: null, rows: 0, updated: null,
  };
  if (admin) {
    const { data } = await admin
      .from("sales_by_postcode_monthly")
      .select("month, updated_at")
      .order("month", { ascending: true })
      .limit(20000);
    const rows = data ?? [];
    const months = Array.from(new Set(rows.map((r) => String(r.month).slice(0, 7)))).sort();
    coverage = {
      months: months.length,
      first: months[0] ?? null,
      last: months[months.length - 1] ?? null,
      rows: rows.length,
      updated: rows.reduce<string | null>((m, r) => (r.updated_at > (m ?? "") ? String(r.updated_at) : m), null),
    };
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Sales upload</h1>
        <Link href="/dashboard/admin/demand" className="text-sm underline">← Demand by region</Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Puts Outback Fencing&apos;s sales next to what farmers ask for, by region and month. In
        Shopify: Orders → Export → &quot;All orders&quot; as CSV, then drop the file here. The
        browser collapses it to one row per month and postcode (orders, revenue) before anything
        is sent. Names, emails, addresses and order numbers never leave your computer.
      </p>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <p className="font-semibold text-neutral-800">Currently loaded</p>
        {coverage.rows === 0 ? (
          <p className="mt-1 text-neutral-600">Nothing yet. The demand report shows sales columns once this has data.</p>
        ) : (
          <p className="mt-1 text-neutral-700">
            {coverage.rows.toLocaleString("en-AU")} rows across {coverage.months} month{coverage.months === 1 ? "" : "s"} ({coverage.first} to {coverage.last}).
            {coverage.updated ? ` Last upload ${new Date(coverage.updated).toLocaleDateString("en-AU")}.` : ""}
          </p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Re-uploading the same months overwrites them, so a fresh full export each month keeps it right.
        </p>
      </div>

      <SalesUploadForm />
    </div>
  );
}
