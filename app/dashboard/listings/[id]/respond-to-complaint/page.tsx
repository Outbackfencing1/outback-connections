import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { relativeTime } from "@/lib/format";
import RespondForm from "./RespondForm";

export const metadata = {
  title: "Respond to a complaint — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function RespondPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    redirect(`/signin?next=/dashboard/listings/${params.id}/respond-to-complaint`);
  }

  // Verify ownership and load listing + open complaints
  const { data: listing } = await supabase
    .from("listings")
    .select("id, title, slug, kind, user_id, status, under_review, under_review_reason, under_review_since")
    .eq("id", params.id)
    .maybeSingle();

  if (!listing || listing.user_id !== userData.user.id) {
    notFound();
  }

  const { data: complaints } = await supabase
    .from("defamation_complaints")
    .select(
      "anonymised_id, type_of_concern, notice_type, statement_at_issue, reputation_harm_narrative, received_at, action_taken, owner_response_text, owner_responded_at, owner_response_deadline"
    )
    .eq("listing_id", listing.id)
    .order("received_at", { ascending: false });

  const open = (complaints ?? []).filter((c) => !c.owner_responded_at && !c.action_taken);
  const past = (complaints ?? []).filter((c) => c.owner_responded_at || c.action_taken);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm">
        <Link href="/dashboard/listings" className="text-neutral-600 underline">
          ← My listings
        </Link>
      </p>

      <h1 className="mt-3 text-3xl font-bold tracking-tight">
        Respond to a complaint
      </h1>
      <p className="mt-2 text-sm text-neutral-700">
        Listing: <strong>{listing.title}</strong>
      </p>

      {listing.under_review && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p>
            <strong>This listing is currently hidden from public view</strong>{" "}
            because of a {listing.under_review_reason ?? "complaint"} received{" "}
            {listing.under_review_since
              ? relativeTime(listing.under_review_since)
              : "recently"}
            . You have 7 days from receipt to respond. Without a response we
            will permanently remove the listing.
          </p>
        </div>
      )}

      {open.length === 0 ? (
        <p className="mt-8 rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700">
          No open complaints to respond to.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {open.map((c) => (
            <article
              key={c.anonymised_id}
              className="rounded-xl border border-neutral-200 bg-white p-5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-mono text-xs text-neutral-500">
                  {c.anonymised_id}
                </p>
                <p className="text-xs text-neutral-500">
                  Received {relativeTime(c.received_at)}
                  {c.owner_response_deadline && (
                    <>
                      {" "}
                      · respond by{" "}
                      {new Date(c.owner_response_deadline).toLocaleDateString(
                        "en-AU"
                      )}
                    </>
                  )}
                </p>
              </div>
              <p className="mt-1 text-sm font-semibold text-neutral-900">
                Type: {c.type_of_concern} ({c.notice_type ?? "—"})
              </p>

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                  Statement at issue
                </p>
                <p className="mt-1 whitespace-pre-line rounded-lg bg-neutral-50 p-3 text-sm text-neutral-800">
                  {c.statement_at_issue ?? "(not provided)"}
                </p>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-700">
                  Why they say it&apos;s harmful
                </p>
                <p className="mt-1 whitespace-pre-line rounded-lg bg-neutral-50 p-3 text-sm text-neutral-800">
                  {c.reputation_harm_narrative ?? "(not provided)"}
                </p>
              </div>

              <div className="mt-6">
                <RespondForm
                  listingId={listing.id}
                  complaintId={c.anonymised_id}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-neutral-900">
            Past complaints on this listing
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {past.map((c) => (
              <li
                key={c.anonymised_id}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <span className="font-mono text-xs text-neutral-500">
                  {c.anonymised_id}
                </span>{" "}
                · {c.type_of_concern} ·{" "}
                <span className="text-neutral-700">
                  {c.action_taken ?? "responded"}
                </span>{" "}
                ·{" "}
                <span className="text-xs text-neutral-500">
                  {relativeTime(c.received_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        Plain English is fine. Your response goes to the admin queue along
        with the original complaint. Admin can dismiss (restore your listing),
        uphold (permanent removal), or require a modification.
      </p>
    </div>
  );
}
