// /dashboard/admin/import — admin-only scraped-import PREVIEW.
// Paste a normalised import batch (JSON array) and see exactly what WOULD be
// written (validation, resolved category, would-create vs would-update, deduped
// on the place_id source key) BEFORE anything commits. Dry run by default.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ImportPreviewForm from "./ImportPreviewForm";

export const metadata = {
  title: "Import preview — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/import");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Import preview</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Admins only</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/dashboard" className="underline">← Back to dashboard</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Scraped import — preview</h1>
        <Link href="/dashboard/admin/flags" className="text-sm underline">
          ← Admin
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Paste a normalised import batch and preview exactly what would be written.
        Nothing is saved until you commit. Every imported listing is created{" "}
        <strong>scraped / unclaimed</strong> with honest source attribution.
      </p>

      <details className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-neutral-800">
          Import record format
        </summary>
        <div className="mt-3 space-y-2 text-neutral-700">
          <p>
            An array of objects. The scrape script
            (<code>scripts/scrape-rural-directory.mjs</code>) emits this shape; full
            spec in <code>docs/INGEST-IMPORT-FORMAT.md</code>.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li><code>vertical</code> — <code>&quot;job&quot;</code> or <code>&quot;freight&quot;</code> (required)</li>
            <li><code>source_platform</code>, <code>source_external_id</code> (place_id), <code>source_url</code> — required (dedupe + attribution)</li>
            <li><code>name</code>, <code>postcode</code> (4-digit) — required</li>
            <li><code>category_slug</code> — optional; falls back to <code>jobs-other</code> / <code>freight-other</code></li>
            <li><code>suburb</code>, <code>state</code>, <code>website</code>, <code>geo_lat</code>, <code>geo_lng</code>, <code>raw_payload</code> — optional</li>
          </ul>
          <p className="text-xs text-neutral-500">
            Scraped phone/email are kept private in <code>listing_sources.raw_payload</code>
            — never written to the public business/listing contact fields.
          </p>
        </div>
      </details>

      <ImportPreviewForm />

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">← Back to dashboard</Link>
      </p>
    </div>
  );
}
