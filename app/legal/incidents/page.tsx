import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";

export const metadata = {
  title: "Incidents dashboard — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function IncidentsDashboardPage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/legal/incidents");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="text-2xl font-bold tracking-tight">
          Incidents dashboard
        </h1>
        <p className="mt-3 text-sm text-neutral-700">
          Admin only. Sign in as an admin user to view this page.
        </p>
        <p className="mt-6 text-sm">
          <Link href="/dashboard" className="underline">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    );
  }

  const [openComplaints, hidden, hotListings, deletions] = await Promise.all([
    supabase
      .from("defamation_complaints")
      .select(
        "anonymised_id, type_of_concern, notice_type, complainant_name, complainant_email, received_at, owner_response_deadline, owner_responded_at, action_taken, listing_title_snapshot, listing_id"
      )
      .is("action_taken", null)
      .order("received_at", { ascending: false })
      .limit(100),
    supabase
      .from("listings")
      .select(
        "id, title, slug, kind, status, under_review, under_review_reason, under_review_since, flag_count, created_at"
      )
      .or("under_review.eq.true,status.eq.hidden_flagged")
      .order("under_review_since", { ascending: false, nullsFirst: false })
      .limit(100),
    supabase
      .from("listings")
      .select("id, title, kind, slug, flag_count, created_at, status")
      .gte("flag_count", 2)
      .order("flag_count", { ascending: false })
      .limit(100),
    supabase
      .from("account_deletions")
      .select("anonymised_id, deletion_requested_at, retention_reason, final_purge_at")
      .is("deletion_completed_at", null)
      .order("deletion_requested_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <p className="text-sm">
        <Link href="/dashboard" className="text-neutral-600 underline">
          ← Dashboard
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        Incidents dashboard
      </h1>
      <p className="mt-2 max-w-prose text-sm text-neutral-700">
        Single-screen weekly review for admin/legal. Open complaints, listings
        under review, listings with multiple flags, and account deletions still
        in retention.
      </p>

      <Section
        title={`Open defamation / concerns complaints (${(openComplaints.data ?? []).length})`}
      >
        {(openComplaints.data ?? []).length === 0 ? (
          <Empty text="No open complaints." />
        ) : (
          <ul className="space-y-2 text-sm">
            {(openComplaints.data ?? []).map((c) => {
              const overdue =
                c.owner_response_deadline &&
                new Date(c.owner_response_deadline) < new Date();
              return (
                <li
                  key={c.anonymised_id}
                  className={`rounded-lg border p-3 ${
                    overdue
                      ? "border-red-300 bg-red-50"
                      : "border-neutral-200 bg-white"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-mono text-xs">{c.anonymised_id}</p>
                    <p className="text-xs text-neutral-500">
                      {relativeTime(c.received_at)}
                    </p>
                  </div>
                  <p className="mt-1 text-neutral-900">
                    <strong>{c.type_of_concern}</strong> ({c.notice_type ?? "—"}) ·{" "}
                    {c.listing_title_snapshot ?? "(no listing resolved)"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-700">
                    From {c.complainant_name ?? "?"} &lt;{c.complainant_email}&gt;
                  </p>
                  {c.owner_response_deadline && (
                    <p
                      className={`mt-1 text-xs ${
                        overdue ? "text-red-700 font-semibold" : "text-amber-700"
                      }`}
                    >
                      {overdue ? "OVERDUE — " : "Owner deadline: "}
                      {new Date(c.owner_response_deadline).toLocaleDateString(
                        "en-AU"
                      )}
                      {c.owner_responded_at &&
                        ` · responded ${relativeTime(c.owner_responded_at)}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={`Listings under review or hidden (${(hidden.data ?? []).length})`}>
        {(hidden.data ?? []).length === 0 ? (
          <Empty text="No listings hidden." />
        ) : (
          <ul className="space-y-2 text-sm">
            {(hidden.data ?? []).map((l) => (
              <li
                key={l.id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <p className="font-medium text-neutral-900">{l.title}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  {l.kind} · status: {l.status} ·{" "}
                  {l.under_review ? `under review (${l.under_review_reason})` : "hidden"}{" "}
                  {l.under_review_since &&
                    `since ${relativeTime(l.under_review_since)}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Listings with 2+ flags (${(hotListings.data ?? []).length})`}>
        {(hotListings.data ?? []).length === 0 ? (
          <Empty text="No listings with multiple flags." />
        ) : (
          <ul className="space-y-2 text-sm">
            {(hotListings.data ?? []).map((l) => (
              <li
                key={l.id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <p className="font-medium text-neutral-900">{l.title}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  {l.kind} · {l.flag_count} flags · status: {l.status} ·{" "}
                  {relativeTime(l.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={`Account deletions in retention (${(deletions.data ?? []).length})`}
      >
        {(deletions.data ?? []).length === 0 ? (
          <Empty text="No accounts in deletion retention period." />
        ) : (
          <ul className="space-y-2 text-sm">
            {(deletions.data ?? []).map((d) => (
              <li
                key={d.anonymised_id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <p className="font-mono text-xs">{d.anonymised_id}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Requested {relativeTime(d.deletion_requested_at)} · reason:{" "}
                  {d.retention_reason ?? "—"} · purge:{" "}
                  {d.final_purge_at
                    ? new Date(d.final_purge_at).toLocaleDateString("en-AU")
                    : "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="mt-10 flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/admin/flags" className="underline text-neutral-700">
          → Flag queue
        </Link>
        <Link href="/dashboard/admin/moderation" className="underline text-neutral-700">
          → Moderation history
        </Link>
        <Link href="/dashboard/admin/duplicate-accounts" className="underline text-neutral-700">
          → Duplicate accounts
        </Link>
        <Link href="/dashboard/admin/lockdown" className="underline text-neutral-700">
          → Lockdown
        </Link>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600">
      {text}
    </p>
  );
}
