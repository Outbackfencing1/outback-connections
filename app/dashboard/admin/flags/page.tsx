import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listingHref, kindLabel, relativeTime } from "@/lib/format";
import { readAndClearFlash } from "@/lib/posting";
import FlagRowActions from "./FlagRowActions";

export const metadata = {
  title: "Flag queue — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  postcode: string;
  status: string;
  flag_count: number;
  created_at: string;
  user_id: string;
};

export default async function AdminFlagQueuePage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/flags");

  // is_admin gate
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Flag queue</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Admins only</p>
          <p className="mt-2">
            This page is for moderation staff. If you need to report a
            listing, use the flag button on any listing page.
          </p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/dashboard" className="underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    );
  }

  const flash = readAndClearFlash();

  const { data: rows } = await supabase
    .from("listings")
    .select("id, slug, kind, title, postcode, status, flag_count, created_at, user_id")
    .gt("flag_count", 0)
    .order("flag_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  const listings: Row[] = rows ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Flag queue</h1>
        <Link href="/dashboard/admin/moderation" className="text-sm underline">
          Moderation history →
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Listings with one or more flags. V1 is manual review — Phase 2 adds
        auto-hide at 2+ flags.
      </p>

      {flash && (
        <div role="status" className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          {flash}
        </div>
      )}

      {listings.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-700">
          Nothing flagged. All quiet.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {listings.map((l) => (
            <li
              key={l.id}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={listingHref(l.kind, l.slug)}
                  className="font-medium text-neutral-900 underline-offset-2 hover:underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {l.title}
                </Link>
                <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  {l.flag_count} flag{l.flag_count === 1 ? "" : "s"}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-600">
                {kindLabel(l.kind)} · postcode {l.postcode} · status{" "}
                <span className="font-mono">{l.status}</span> · posted{" "}
                {relativeTime(l.created_at)}
              </p>

              <FlagDetails listingId={l.id} />

              <div className="mt-3">
                <FlagRowActions
                  listingId={l.id}
                  status={l.status}
                  listingTitle={l.title}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/dashboard" className="underline">
          ← Back to dashboard
        </Link>
      </p>
    </div>
  );
}

async function FlagDetails({ listingId }: { listingId: string }) {
  const supabase = createClient();
  const { data: flags } = await supabase
    .from("listing_flags")
    .select("reason, note, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!flags || flags.length === 0) return null;

  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-xs text-neutral-700 underline">
        {flags.length} flag detail{flags.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-2 space-y-1 rounded border border-neutral-200 bg-neutral-50 p-3">
        {flags.map((f, i) => (
          <li key={i} className="text-xs text-neutral-800">
            <span className="font-mono uppercase tracking-wide">{f.reason}</span>
            {" — "}
            {f.note ? <span>&ldquo;{f.note}&rdquo;</span> : <span className="text-neutral-500">(no note)</span>}
            <span className="ml-2 text-neutral-500">
              {relativeTime(f.created_at)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
