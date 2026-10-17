import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listingHref, relativeTime } from "@/lib/format";

export const metadata = {
  title: "Enquiries & Messages Received — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type EnquiryRow = {
  id: string;
  anonymised_id: string;
  created_at: string;
  listing_id: string;
  vertical: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  region_state: string | null;
  message: string;
  status: string;
};

export default async function DashboardMessagesPage() {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/signin?next=/dashboard/messages");

  const user = auth.user;
  const admin = createAdminClient();

  let enquiries: Array<
    EnquiryRow & {
      listing_title: string;
      listing_slug: string;
      listing_kind: string;
    }
  > = [];

  if (admin) {
    const [{ data: userListings }, { data: claimedBusinesses }] = await Promise.all([
      admin
        .from("listings")
        .select("id, title, slug, kind")
        .eq("user_id", user.id),
      admin
        .from("businesses")
        .select("id")
        .eq("claimed_by", user.id),
    ]);

    const bizIds = (claimedBusinesses ?? []).map((b) => b.id);
    let bizListings: Array<{ id: string; title: string; slug: string; kind: string }> = [];
    if (bizIds.length > 0) {
      const { data: bl } = await admin
        .from("listings")
        .select("id, title, slug, kind")
        .in("business_id", bizIds);
      bizListings = (bl ?? []) as typeof bizListings;
    }

    const listingMap = new Map<
      string,
      { id: string; title: string; slug: string; kind: string }
    >();
    for (const l of [...(userListings ?? []), ...bizListings]) {
      listingMap.set(l.id, l);
    }

    const allListingIds = Array.from(listingMap.keys());
    if (allListingIds.length > 0) {
      const { data: rawEnquiries } = await admin
        .from("listing_enquiries")
        .select(
          "id, anonymised_id, created_at, listing_id, vertical, name, email, phone, postcode, region_state, message, status"
        )
        .in("listing_id", allListingIds)
        .neq("status", "spam")
        .order("created_at", { ascending: false })
        .limit(100);

      enquiries = ((rawEnquiries ?? []) as EnquiryRow[]).map((e) => {
        const l = listingMap.get(e.listing_id);
        return {
          ...e,
          listing_title: l?.title ?? "Your listing",
          listing_slug: l?.slug ?? "",
          listing_kind: l?.kind ?? "service_offering",
        };
      });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Messages &amp; Enquiries
          </h1>
          <p className="mt-1 text-sm text-neutral-700">
            Direct messages, quote requests, work enquiries, and buyer offers sent to your listings.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-neutral-700 underline">
          ← Dashboard
        </Link>
      </div>

      {enquiries.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
          <p className="text-base font-semibold text-neutral-900">
            No messages or enquiries yet
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            When a farmer, buyer, contractor, or employer messages one of your listings, it shows up here and is emailed straight to you.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/post/job?direction=available_for_work"
              className="rounded-lg bg-green-700 px-4 py-2 text-xs font-semibold text-white hover:bg-green-800"
            >
              List your skills
            </Link>
            <Link
              href="/post/sale"
              className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100"
            >
              Post livestock, hay or gear
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {enquiries.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-100 pb-3">
                <div>
                  <span className="text-base font-bold text-neutral-900">
                    {e.name}
                  </span>
                  {e.postcode && (
                    <span className="ml-2 text-xs font-medium text-neutral-600">
                      Postcode {e.postcode}
                      {e.region_state ? ` (${e.region_state})` : ""}
                    </span>
                  )}
                </div>
                <span className="text-xs text-neutral-500">
                  {relativeTime(e.created_at)} · Ref {e.anonymised_id}
                </span>
              </div>

              <p className="mt-2 text-xs text-neutral-600">
                Regarding:{" "}
                {e.listing_slug ? (
                  <Link
                    href={listingHref(e.listing_kind, e.listing_slug)}
                    className="font-semibold text-green-800 underline"
                  >
                    {e.listing_title}
                  </Link>
                ) : (
                  <strong className="text-neutral-800">{e.listing_title}</strong>
                )}
              </p>

              <p className="mt-3 whitespace-pre-line rounded-xl bg-neutral-50 p-3.5 text-sm text-neutral-900">
                {e.message}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {e.phone && (
                  <a
                    href={`tel:${e.phone.replace(/\s+/g, "")}`}
                    className="rounded-lg bg-green-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-green-800"
                  >
                    📞 Call {e.phone}
                  </a>
                )}
                {e.email && (
                  <a
                    href={`mailto:${e.email}?subject=${encodeURIComponent(
                      `Re: ${e.listing_title} (Outback Connections)`
                    )}`}
                    className="rounded-lg border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-50"
                  >
                    ✉️ Email {e.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
