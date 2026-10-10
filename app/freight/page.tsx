import Link from "next/link";
import { liveListingCount } from "@/lib/live-counts";
import { browseRobots, hasFilterParams } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import ListingCard from "@/components/browse/ListingCard";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";
import { logSearch } from "@/lib/analytics";
import { getCategoryCounts } from "@/lib/category-counts";

// Noindex while the section is empty (it's hidden from the nav then) or
// filtered; see browseRobots().
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [liveCount, resolvedSearchParams] = await Promise.all([
    liveListingCount({ kinds: ["freight"] }),
    searchParams,
  ]);
  return {
    alternates: { canonical: "/freight" },
    title: "Freight — Outback Connections",
    description:
      "Rural freight: livestock, hay, grain, machinery. Farmers needing freight, truckies with available runs. Free to browse.",
    robots: browseRobots({ liveCount, filtered: hasFilterParams(resolvedSearchParams) }),
  };
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

function getStr(p: SearchParams, key: string): string {
  const v = p[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function FreightBrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = createClient();

  const postcode = getStr(resolvedSearchParams, "postcode").trim();
  const direction = getStr(resolvedSearchParams, "direction").trim();
  const vehicle = getStr(resolvedSearchParams, "vehicle_type").trim();
  const page = Math.max(1, parseInt(getStr(resolvedSearchParams, "page") || "1", 10) || 1);

  let query = supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at, data_source,
      category:categories(slug, label),
      business:businesses(claim_status),
      freight_details!inner(direction, vehicle_type, origin_postcode, destination_postcode)
    `,
      { count: "exact" }
    )
    .eq("kind", "freight")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (postcode) query = query.like("postcode", `${postcode}%`);
  if (direction) query = query.eq("freight_details.direction", direction);
  if (vehicle) query = query.eq("freight_details.vehicle_type", vehicle);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const [{ data: listings, count }, freightCounts] = await Promise.all([
    query,
    getCategoryCounts("freight"),
  ]);

  const total = count ?? 0;
  if (page === 1) {
    await logSearch({
      vertical: "freight",
      filters: { postcode: postcode || null, direction: direction || null, vehicle_type: vehicle || null },
      resultCount: total,
      postcode: postcode || null,
    });
  }
  const filterQS = new URLSearchParams(
    Object.fromEntries(Object.entries({ postcode, direction, vehicle_type: vehicle }).filter(([, v]) => v))
  ).toString();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Freight</h1>
        <Link
          href="/post/freight"
          className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Post freight
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Livestock, hay, grain, machinery. Farmers needing freight; truckies
        with available runs. Free to browse. Sign in to see contact details.
      </p>

      <div className="mt-6">
        <FilterBar action="/freight" postcode={postcode} resetHref="/freight">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Direction</span>
            <select
              name="direction"
              defaultValue={direction}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Both</option>
              <option value="need_freight">Needs freight moved</option>
              <option value="offering_truck">Truck with space</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Vehicle type</span>
            <select
              name="vehicle_type"
              defaultValue={vehicle}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Any</option>
              <option value="tipper">Tipper</option>
              <option value="livestock">Livestock crate</option>
              <option value="flatbed">Flatbed</option>
              <option value="b_double">B-double</option>
              <option value="refrigerated">Refrigerated</option>
              <option value="tray">Tray</option>
              <option value="other">Other</option>
            </select>
          </label>
        </FilterBar>
      </div>

      <div className="mt-6">
        {!listings || listings.length === 0 ? (
          freightCounts.total === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
              <p className="text-sm font-semibold text-neutral-800">No freight listed yet.</p>
              <p className="mt-2 text-sm text-neutral-700">
                Got a load to move, or a truck with space?{" "}
                <Link href="/post/freight" className="font-medium text-green-800 underline">
                  Post it
                </Link>{" "}
                free.
              </p>
            </div>
          ) : (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
            <p className="text-sm text-neutral-700">No freight listings match.</p>
            <p className="mt-2 text-xs text-neutral-500">
              Try a wider postcode or remove a filter. Or{" "}
              <Link href="/post/freight" className="underline">
                post a freight listing
              </Link>
              .
            </p>
          </div>
          )
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
        baseHref={`/freight${filterQS ? `?${filterQS}` : ""}`}
      />
    </div>
  );
}
