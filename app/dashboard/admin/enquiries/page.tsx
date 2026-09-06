// /dashboard/admin/enquiries — the farmer-enquiry queue. Each row is a real
// person asking a listed business for a quote. Unclaimed rows need a human to
// forward them (the contractor's private phone/email is shown here, admin
// only). Claimed rows were emailed directly and land here already forwarded.
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listingHref, relativeTime } from "@/lib/format";
import EnquiryRowActions from "./EnquiryRowActions";

export const metadata = {
  title: "Enquiries — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type ListingRef = {
  id: string;
  title: string;
  slug: string;
  kind: string;
  business: { trading_name: string | null; claim_status: string } | { trading_name: string | null; claim_status: string }[] | null;
};

type Row = {
  id: string;
  anonymised_id: string;
  created_at: string;
  status: string;
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  region_state: string | null;
  message: string;
  forwarded_at: string | null;
  forwarded_via: string | null;
  notes: string | null;
  listing_id: string;
  listing: ListingRef | ListingRef[] | null;
};

const STATUSES = ["open", "new", "forwarded", "closed", "spam", "all"] as const;

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/enquiries");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!(profile?.is_admin || profile?.is_staff)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Enquiries</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Staff and admins only</p>
        </div>
      </div>
    );
  }

  const raw = typeof sp.status === "string" ? sp.status : "open";
  const filter = (STATUSES as readonly string[]).includes(raw) ? raw : "open";

  let query = supabase
    .from("listing_enquiries")
    .select(
      `id, anonymised_id, created_at, status, name, email, phone, postcode, region_state, message,
       forwarded_at, forwarded_via, notes, listing_id,
       listing:listings(id, title, slug, kind, business:businesses(trading_name, claim_status))`
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "open") query = query.in("status", ["new", "forwarded"]);
  else if (filter !== "all") query = query.eq("status", filter);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  // Contractor private contact (from the source record) so the team can
  // forward without leaving this page. Service role; admin-only page.
  const admin = createAdminClient();
  const privateContact = new Map<string, { phone: string | null; email: string | null }>();
  if (admin && rows.length > 0) {
    const ids = Array.from(new Set(rows.map((r) => r.listing_id)));
    const { data: sources } = await admin
      .from("listing_sources")
      .select("listing_id, raw_payload")
      .in("listing_id", ids);
    for (const s of sources ?? []) {
      const p = (s.raw_payload ?? {}) as { phone?: string | null; email?: string | null };
      privateContact.set(s.listing_id as string, { phone: p.phone ?? null, email: p.email ?? null });
    }
    const { data: owned } = await admin
      .from("listings")
      .select("id, contact_phone, contact_email")
      .in("id", ids);
    for (const l of owned ?? []) {
      const cur = privateContact.get(l.id) ?? { phone: null, email: null };
      privateContact.set(l.id, { phone: l.contact_phone ?? cur.phone, email: l.contact_email ?? cur.email });
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Enquiries</h1>
        <Link href="/dashboard/admin/flags" className="text-sm underline">← Admin</Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Farmers asking a listed business for a quote. <strong>New</strong> on an unclaimed
        listing means a person has to forward it (phone, SMS, email) and mark it. Claimed
        listings are emailed automatically and arrive as <strong>forwarded</strong>.
      </p>

      <nav className="mt-4 flex flex-wrap gap-2 text-xs">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/dashboard/admin/enquiries?status=${s}`}
            className={`rounded-full border px-3 py-1 ${
              filter === s ? "border-green-700 bg-green-50 text-green-900" : "border-neutral-300 text-neutral-700"
            }`}
          >
            {s}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-700">
          Nothing here.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => {
            const l = Array.isArray(r.listing) ? r.listing[0] ?? null : r.listing;
            const b = l ? (Array.isArray(l.business) ? l.business[0] ?? null : l.business) : null;
            const claimed = !!b && b.claim_status !== "unclaimed";
            const pc = privateContact.get(r.listing_id);
            return (
              <li key={r.id} className="rounded-xl border border-neutral-200 bg-white p-4 text-sm shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-neutral-900">
                    {r.name}
                    <span className="ml-2 text-xs font-normal text-neutral-500">{r.anonymised_id}</span>
                  </span>
                  <span className="text-xs text-neutral-500">
                    {relativeTime(r.created_at)} ·{" "}
                    <span
                      className={`rounded px-1.5 py-0.5 font-medium ${
                        r.status === "new"
                          ? "bg-amber-100 text-amber-900"
                          : r.status === "forwarded"
                            ? "bg-blue-100 text-blue-900"
                            : r.status === "spam"
                              ? "bg-red-100 text-red-900"
                              : "bg-neutral-100 text-neutral-700"
                      }`}
                    >
                      {r.status}
                      {r.forwarded_via ? ` (${r.forwarded_via.replace("_", " ")})` : ""}
                    </span>
                  </span>
                </div>

                <p className="mt-1 text-xs text-neutral-600">
                  Farmer: {[r.phone, r.email].filter(Boolean).join(" · ") || "—"}
                  {r.postcode ? ` · job at ${r.postcode}${r.region_state ? ` ${r.region_state}` : ""}` : ""}
                </p>

                <p className="mt-2 whitespace-pre-line text-neutral-800">{r.message}</p>

                {l && (
                  <p className="mt-2 text-xs text-neutral-600">
                    For{" "}
                    <Link href={listingHref(l.kind, l.slug)} className="underline" target="_blank">
                      {l.title}
                    </Link>{" "}
                    ({claimed ? "claimed" : "unclaimed"})
                    {pc && (pc.phone || pc.email) ? (
                      <>
                        {" "}· contractor (private): {[pc.phone, pc.email].filter(Boolean).join(" · ")}
                      </>
                    ) : (
                      <> · no contractor contact on file</>
                    )}
                  </p>
                )}
                {r.notes && <p className="mt-1 text-xs text-neutral-500">Note: {r.notes}</p>}

                <EnquiryRowActions id={r.id} status={r.status} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
