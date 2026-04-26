import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";

export const metadata = {
  title: "Transparency — Outback Connections",
  description:
    "Aggregate moderation statistics for the past 30 days: listings hidden, complaints received, complaints upheld vs dismissed.",
};

export const dynamic = "force-dynamic";

type TransparencyStats = {
  listings_hidden_30d: number;
  complaints_received_30d: number;
  complaints_upheld_30d: number;
  complaints_dismissed_30d: number;
  flags_received_30d: number;
  defamation_complaints_30d: number;
  active_listings_total: number;
  generated_at: string;
};

async function fetchStats(): Promise<TransparencyStats> {
  const supabase = createAnonClient();
  const sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date().toISOString();

  const [
    hiddenRes,
    complaintsRes,
    upheldRes,
    dismissedRes,
    flagsRes,
    defamationRes,
    activeRes,
  ] = await Promise.all([
    supabase
      .from("moderation_actions")
      .select("id", { count: "exact", head: true })
      .in("action", ["hide", "remove_permanently"])
      .gte("created_at", sinceIso),
    supabase
      .from("defamation_complaints")
      .select("id", { count: "exact", head: true })
      .gte("received_at", sinceIso),
    supabase
      .from("defamation_complaints")
      .select("id", { count: "exact", head: true })
      .eq("action_taken", "removed_permanently")
      .gte("received_at", sinceIso),
    supabase
      .from("defamation_complaints")
      .select("id", { count: "exact", head: true })
      .in("action_taken", ["no_action", "restored"])
      .gte("received_at", sinceIso),
    supabase
      .from("listing_flags")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sinceIso),
    supabase
      .from("defamation_complaints")
      .select("id", { count: "exact", head: true })
      .gte("received_at", sinceIso),
    supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .gt("expires_at", nowIso),
  ]);

  return {
    listings_hidden_30d: hiddenRes.count ?? 0,
    complaints_received_30d: complaintsRes.count ?? 0,
    complaints_upheld_30d: upheldRes.count ?? 0,
    complaints_dismissed_30d: dismissedRes.count ?? 0,
    flags_received_30d: flagsRes.count ?? 0,
    defamation_complaints_30d: defamationRes.count ?? 0,
    active_listings_total: activeRes.count ?? 0,
    generated_at: new Date().toISOString(),
  };
}

const getCachedStats = unstable_cache(fetchStats, ["transparency-stats-v1"], {
  revalidate: 600,
  tags: ["transparency"],
});

export default async function TransparencyPage() {
  const stats = await getCachedStats();

  const hasAnyActivity =
    stats.listings_hidden_30d +
      stats.complaints_received_30d +
      stats.flags_received_30d >
    0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Transparency</h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-700">
        Aggregate moderation statistics for the rolling last 30 days. We
        publish these so anyone — users, complainants, regulators — can see
        how we&apos;re running the platform. No personal information is
        included. Data is updated every 10 minutes.
      </p>

      {!hasAnyActivity ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-700">
          <p>
            No moderation activity in the last 30 days. We&apos;ll publish
            numbers as soon as there&apos;s anything to report.
          </p>
        </div>
      ) : (
        <>
          <section className="mt-8 grid gap-3 sm:grid-cols-2">
            <Stat
              label="Listings hidden or removed"
              value={stats.listings_hidden_30d}
              note="Hidden by moderation in the last 30 days."
            />
            <Stat
              label="Active listings (now)"
              value={stats.active_listings_total}
              note="Snapshot of currently active listings."
            />
            <Stat
              label="Flags received"
              value={stats.flags_received_30d}
              note="User-submitted flags in the last 30 days."
            />
            <Stat
              label="Defamation / legal concerns received"
              value={stats.defamation_complaints_30d}
              note="Concerns notices via /legal/concerns-notice or detail-page reports."
            />
            <Stat
              label="Complaints upheld"
              value={stats.complaints_upheld_30d}
              note="Resulted in permanent removal."
            />
            <Stat
              label="Complaints dismissed"
              value={stats.complaints_dismissed_30d}
              note="Reviewed and declined or restored after review."
            />
          </section>

          <p className="mt-8 text-xs text-neutral-500">
            Stats generated{" "}
            {new Date(stats.generated_at).toLocaleString("en-AU", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            . Cached for 10 minutes.
          </p>
        </>
      )}

      <section className="mt-10 rounded-xl border border-neutral-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-neutral-900">How we moderate</h2>
        <ul className="mt-3 space-y-2 text-neutral-800">
          <li>
            We rely on user flags + defamation/concerns notices. We don&apos;t
            pre-moderate listings.
          </li>
          <li>
            For defamation or illegal-content notices, we hide the listing
            and give the owner 7 days to respond before permanent removal.
          </li>
          <li>
            Substantive responses to concerns notices: 5 business days.
          </li>
          <li>
            All moderation actions are logged in an internal audit table.
          </li>
        </ul>
        <p className="mt-3 text-neutral-700">
          See our{" "}
          <Link href="/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/acceptable-use" className="underline">
            Acceptable Use Policy
          </Link>{" "}
          for the rules. To submit a concerns notice:{" "}
          <Link href="/legal/concerns-notice" className="underline">
            /legal/concerns-notice
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold text-neutral-900">
        {value.toLocaleString("en-AU")}
      </p>
      <p className="mt-1 text-xs text-neutral-500">{note}</p>
    </div>
  );
}
