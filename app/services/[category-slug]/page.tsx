import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ListingCard from "@/components/browse/ListingCard";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";
import { logSearch } from "@/lib/analytics";
import { breadcrumbJsonLd, humanCategory, jsonLdScript } from "@/lib/seo";
import { regionCounts } from "@/lib/regions";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

const BASE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://www.outbackconnections.com.au";

type SearchParams = Record<string, string | string[] | undefined>;

function getStr(p: SearchParams, key: string): string {
  const v = p[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ "category-slug": string }>;
}) {
  const resolvedParams = await params;
  const slug = resolvedParams["category-slug"];
  const { data: cat } = await createClient()
    .from("categories")
    .select("label")
    .eq("slug", slug)
    .eq("pillar", "services")
    .maybeSingle();
  const human = cat ? humanCategory(cat.label) : slug.replace(/-/g, " ");
  return {
    title: `${human} — Outback Connections`,
    description: `${human} across rural Australia. Free directory, no lead fees: browse by region or postcode and get a quote direct.`,
    alternates: { canonical: `/services/${slug}` },
  };
}

export default async function ServiceCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ "category-slug": string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const supabase = createClient();
  const categorySlug = resolvedParams["category-slug"];

  // Resolve category
  const { data: cat } = await supabase
    .from("categories")
    .select("id, slug, label, pillar, active")
    .eq("slug", categorySlug)
    .maybeSingle();

  if (!cat || cat.pillar !== "services" || !cat.active) {
    notFound();
  }

  const postcode = getStr(resolvedSearchParams, "postcode").trim();
  const direction = getStr(resolvedSearchParams, "direction").trim();
  const page = Math.max(1, parseInt(getStr(resolvedSearchParams, "page") || "1", 10) || 1);

  let query = supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at,
      data_source, source_platform,
      category:categories(slug, label),
      business:businesses(claim_status),
      service_details!inner(direction, rate_type, rate_amount, travel_willingness)
    `,
      { count: "exact" }
    )
    .in("kind", ["service_offering", "service_request"])
    .eq("category_id", cat.id)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (postcode) query = query.like("postcode", `${postcode}%`);
  if (direction) query = query.eq("service_details.direction", direction);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const [{ data: listings, count }, { data: allPostcodes }] = await Promise.all([
    query,
    supabase
      .from("listings")
      .select("postcode")
      .in("kind", ["service_offering", "service_request"])
      .eq("category_id", cat.id)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .limit(2000),
  ]);
  const total = count ?? 0;
  const regions = await regionCounts((allPostcodes ?? []).map((r) => r.postcode));
  if (page === 1) {
    await logSearch({
      vertical: "service",
      filters: { category: categorySlug, postcode: postcode || null, direction: direction || null },
      resultCount: total,
      postcode: postcode || null,
    });
  }

  const filterQS = new URLSearchParams(
    Object.fromEntries(Object.entries({ postcode, direction }).filter(([, v]) => v))
  ).toString();

  const breadcrumb = breadcrumbJsonLd([
    { name: "Home", url: BASE_URL },
    { name: "Services", url: `${BASE_URL}/services` },
    { name: cat.label, url: `${BASE_URL}/services/${cat.slug}` },
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumb) }}
      />
      <p className="text-sm">
        <Link href="/services" className="text-neutral-600 underline">
          ← All services
        </Link>
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {cat.label}
        </h1>
        <Link
          href="/post"
          className="shrink-0 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Post in this category
        </Link>
      </div>

      {regions.length > 1 && (
        <nav aria-label="Browse by region" className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="self-center font-medium text-neutral-600">By region:</span>
          {regions.slice(0, 24).map((r) => (
            <Link
              key={r.slug}
              href={`/services/${cat.slug}/${r.slug}`}
              className="rounded-full border border-neutral-300 bg-white px-3 py-1 text-neutral-800 hover:border-green-700 hover:text-green-800"
            >
              {r.region_name} <span className="text-neutral-500">({r.count})</span>
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-6">
        <FilterBar
          action={`/services/${cat.slug}`}
          postcode={postcode}
          resetHref={`/services/${cat.slug}`}
        >
          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Type</span>
            <select
              name="direction"
              defaultValue={direction}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Both</option>
              <option value="offering">Offering</option>
              <option value="requesting">Requesting</option>
            </select>
          </label>
        </FilterBar>
      </div>

      <div className="mt-6">
        {!listings || listings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <p className="text-sm text-neutral-700">
              No active listings in {cat.label} right now.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Check back soon — or{" "}
              <Link href="/post" className="underline">
                post yours
              </Link>{" "}
              and be the first.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {listings.map((l) => (
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
                    business_claim_status: Array.isArray(l.business)
                      ? l.business[0]?.claim_status ?? null
                      : (l.business as { claim_status?: string } | null)?.claim_status ?? null,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        baseHref={`/services/${cat.slug}${filterQS ? `?${filterQS}` : ""}`}
      />
    </div>
  );
}
