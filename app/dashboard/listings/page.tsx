// Minimal /dashboard/listings stub for Step 5.
// Step 8 replaces this with the full Active / Expired / Hidden management UI.
// For now: redirect-target for posting success; reads + clears the flash cookie.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { readAndClearFlash } from "@/lib/posting";

export const metadata = {
  title: "My listings — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function MyListingsPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/signin?next=/dashboard/listings");

  const flash = readAndClearFlash();

  // Pull the user's listings — basic shape, full UI lands in Step 8
  const { data: listings } = await supabase
    .from("listings")
    .select("id, anonymised_id, slug, kind, title, status, postcode, created_at, expires_at")
    .eq("user_id", data.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">My listings</h1>

      {flash && (
        <div role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {flash}
        </div>
      )}

      <p className="mt-3 text-sm text-neutral-700">
        Showing the most recent 50. The full management view (edit, renew,
        delete, group by status) lands in the next build pass.
      </p>

      {!listings || listings.length === 0 ? (
        <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-700">
          You haven&apos;t posted anything yet.{" "}
          <Link href="/post" className="underline">
            Post a listing
          </Link>
          .
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {listings.map((l) => (
            <li
              key={l.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium text-neutral-900">{l.title}</p>
                <span className="shrink-0 text-xs uppercase tracking-wide text-neutral-500">
                  {l.kind.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                Postcode {l.postcode} · status {l.status} · {" "}
                <span className="font-mono">{l.anonymised_id}</span>
              </p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-sm">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}
