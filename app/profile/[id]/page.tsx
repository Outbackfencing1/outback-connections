import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListingCard from "@/components/browse/ListingCard";
import VendorTrustSection from "@/components/detail/VendorTrustSection";
import type { VendorTrustSummary } from "@/lib/trust";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return { title: "Profile not found — Outback Connections" };
  }
  const supabase = createClient();
  const { data: userRes } = await supabase.rpc("get_vendor_trust_summary", {
    p_user_id: id,
    p_business_id: null,
    p_listing_id: null,
  });
  let summary = userRes as VendorTrustSummary | null;
  if (!summary?.display_name && !summary?.trading_name) {
    const { data: bizRes } = await supabase.rpc("get_vendor_trust_summary", {
      p_user_id: null,
      p_business_id: id,
      p_listing_id: null,
    });
    summary = bizRes as VendorTrustSummary | null;
  }
  const name =
    summary?.trading_name ||
    summary?.display_name ||
    summary?.abn_entity_name ||
    "Rural Member Profile";

  return {
    title: `${name} — Trust Profile & Reviews — Outback Connections`,
    description: `View verification badges, ABN status, active listings, and community reviews for ${name} on Outback Connections.`,
  };
}

export default async function PublicVendorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const viewer = auth.user;

  // Determine whether `id` is a user_id or business_id
  const { data: bizRow } = await supabase
    .from("businesses")
    .select("id, trading_name, legal_name, claimed_by")
    .eq("id", id)
    .maybeSingle();

  const isBusinessId = !!bizRow;
  const resolvedUserId = isBusinessId ? bizRow.claimed_by ?? null : id;
  const resolvedBusinessId = isBusinessId ? bizRow.id : null;

  // Fetch active listings for this user or business
  let listingsQuery = supabase
    .from("listings")
    .select(
      `
      id, anonymised_id, slug, kind, side, title, description, postcode, state, created_at,
      data_source, source_platform,
      category:categories(slug, label),
      business:businesses(claim_status),
      job_details(direction, work_type, pay_type, pay_amount, tickets, travel_willingness, experience_years)
    `
    )
    .eq("status", "active")
    .is("canonical_listing_id", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(30);

  if (resolvedUserId && resolvedBusinessId) {
    listingsQuery = listingsQuery.or(
      `user_id.eq.${resolvedUserId},business_id.eq.${resolvedBusinessId}`
    );
  } else if (resolvedBusinessId) {
    listingsQuery = listingsQuery.eq("business_id", resolvedBusinessId);
  } else if (resolvedUserId) {
    listingsQuery = listingsQuery.eq("user_id", resolvedUserId);
  }

  const { data: rawListings } = await listingsQuery;
  const listings = (rawListings ?? []).map((r) => {
    const cat = Array.isArray(r.category) ? r.category[0] ?? null : r.category;
    const biz = Array.isArray(r.business) ? r.business[0] ?? null : r.business;
    const jd = Array.isArray(r.job_details) ? r.job_details[0] ?? null : r.job_details;
    return {
      anonymised_id: r.anonymised_id,
      slug: r.slug,
      kind: r.kind,
      title: r.title,
      description: r.description,
      postcode: r.postcode,
      state: r.state ?? null,
      created_at: r.created_at,
      category: cat,
      data_source: r.data_source,
      source_platform: r.source_platform,
      business_claim_status: biz?.claim_status ?? null,
      job_meta: jd ?? null,
    };
  });

  const fallbackTitle =
    bizRow?.trading_name ||
    bizRow?.legal_name ||
    listings[0]?.title ||
    "Outback Connections Member";

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-sm">
        <Link href="/" className="text-neutral-600 underline">
          ← Back to Outback Connections
        </Link>
      </p>

      <VendorTrustSection
        userId={resolvedUserId}
        businessId={resolvedBusinessId}
        fallbackTitle={fallbackTitle}
        returnPath={`/profile/${id}`}
        viewerId={viewer?.id ?? null}
        showProfileLink={false}
      />

      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-bold tracking-tight text-neutral-900">
            Active listings ({listings.length})
          </h2>
          <Link href="/post" className="text-xs font-semibold text-green-800 underline">
            Post a listing →
          </Link>
        </div>

        {listings.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-600">
            No active listings right now.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {listings.map((l) => (
              <ListingCard key={l.anonymised_id} listing={l} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
