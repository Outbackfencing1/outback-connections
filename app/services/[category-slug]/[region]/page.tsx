// /services/[category-slug]/[region] — regional landing page, e.g.
// /services/fencing-contractor/orange-nsw. One page per (category, region)
// that has live rows; linked from the category page and the sitemap so
// "fencing contractors Orange" has somewhere honest to land.
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListingCard from "@/components/browse/ListingCard";
import { breadcrumbJsonLd, browseRobots, humanCategory, jsonLdScript, socialMeta } from "@/lib/seo";
import { liveListingCount } from "@/lib/live-counts";
import { getRegionBySlug, regionLabel } from "@/lib/regions";
import { logSearch } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";
const LIMIT = 100;

type Params = Promise<{ "category-slug": string; region: string }>;

export async function generateMetadata({ params }: { params: Params }) {
  const p = await params;
  const region = await getRegionBySlug(p.region);
  const supabase = createClient();
  const { data: cat } = await supabase
    .from("categories")
    .select("id, label")
    .eq("slug", p["category-slug"])
    .eq("pillar", "services")
    .maybeSingle();
  if (!region || !cat) {
    return { title: "Not found — Outback Connections", robots: { index: false, follow: true } };
  }
  const liveCount = await liveListingCount({
    kinds: ["service_offering", "service_request"],
    categoryId: cat.id,
    postcodes: region.postcodes,
  });
  const path = `/services/${p["category-slug"]}/${p.region}`;
  const title = `${humanCategory(cat.label)} in ${regionLabel(region)} — Outback Connections`;
  // Most entries here are unclaimed (found online), so "contact them
  // directly" isn't true; the quote form is the way in.
  const description = `${humanCategory(cat.label)} around ${region.region_name}, ${region.state}. Free rural directory, no lead fees: ask for a quote without an account.`;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: browseRobots({ liveCount }),
    ...socialMeta({ title, description, path }),
  };
}

export default async function ServiceRegionPage({ params }: { params: Params }) {
  const p = await params;
  const supabase = createClient();
  const [region, { data: cat }] = await Promise.all([
    getRegionBySlug(p.region),
    supabase
      .from("categories")
      .select("id, slug, label, pillar, active")
      .eq("slug", p["category-slug"])
      .maybeSingle(),
  ]);
  if (!region || !cat || cat.pillar !== "services" || !cat.active) notFound();

  const { data: listings } = await supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at,
      data_source, source_platform, contact_phone, contact_email,
      category:categories(slug, label),
      business:businesses(claim_status, contact_phone, contact_email, website_url, suburb, outback_verified),
      service_details!inner(direction)
    `
    )
    .in("kind", ["service_offering", "service_request"])
    .eq("category_id", cat.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .in("postcode", region.postcodes)
    .order("created_at", { ascending: false })
    .limit(LIMIT);

  const rows = listings ?? [];
  await logSearch({
    vertical: "service",
    filters: { category: cat.slug, region: p.region },
    resultCount: rows.length,
    regionState: region.state,
  });

  const heading = `${humanCategory(cat.label)} in ${regionLabel(region)}`;
  const pageUrl = `${BASE_URL}/services/${cat.slug}/${p.region}`;
  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", url: BASE_URL },
    { name: "Services", url: `${BASE_URL}/services` },
    { name: cat.label, url: `${BASE_URL}/services/${cat.slug}` },
    { name: regionLabel(region), url: pageUrl },
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <p className="text-sm">
        <Link href={`/services/${cat.slug}`} className="text-neutral-600 underline">
          ← All {humanCategory(cat.label).toLowerCase()}
        </Link>
      </p>

      <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-700">
        {rows.length > 0
          ? `${rows.length} listed around ${region.region_name}. Call, text, or ask for a quote directly — no account needed.`
          : `Nothing listed around ${region.region_name} yet.`}
      </p>

      <div className="mt-6">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <p className="text-sm text-neutral-700">
              Know a good one?{" "}
              <Link href="/post/service/offering" className="underline">
                List your own business
              </Link>{" "}
              or browse{" "}
              <Link href={`/services/${cat.slug}`} className="underline">
                all {humanCategory(cat.label).toLowerCase()}
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((l) => {
              const biz = Array.isArray(l.business) ? l.business[0] ?? null : l.business;
              return (
                <li key={l.anonymised_id}>
                  <ListingCard
                    listing={{
                      anonymised_id: l.anonymised_id,
                      slug: l.slug,
                      kind: l.kind,
                      title: l.title,
                      description: l.description,
                      postcode: l.postcode,
                      state: l.state,
                      created_at: l.created_at,
                      category: Array.isArray(l.category) ? l.category[0] ?? null : l.category,
                      data_source: l.data_source,
                      source_platform: l.source_platform,
                      contact_phone: l.contact_phone,
                      contact_email: l.contact_email,
                      business_claim_status: biz?.claim_status ?? null,
                      business: biz,
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
