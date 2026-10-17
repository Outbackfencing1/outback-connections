import Link from "next/link";
import { liveListingCount } from "@/lib/live-counts";
import { browseRobots, hasFilterParams } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import ListingCard from "@/components/browse/ListingCard";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";
import SearchAlertBox from "@/components/browse/SearchAlertBox";
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
      anonymised_id, slug, kind, title, description, postcode, state, created_at, data_source, contact_phone, contact_email,
      category:categories(slug, label),
      business:businesses(claim_status, contact_phone, contact_email, website_url, suburb, outback_verified),
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Freight &amp; Backloads</h1>
          <p className="mt-2 text-sm text-neutral-700">
            Livestock crates, hay drop-decks, grain tippers and machinery low-loaders. Match loads
            needing a truck with carriers looking for a backload.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Link
            href="/post/freight"
            className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
          >
            Post a load or backload
          </Link>
        </div>
      </div>

      {/* Quick direction & vehicle chips */}
      <nav aria-label="Freight direction and vehicle filters" className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
        <Link
          href={`/freight${postcode ? `?postcode=${postcode}` : ""}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            direction === "" && vehicle === ""
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          All freight &amp; backloads
        </Link>
        <Link
          href={`/freight?direction=offering_truck${postcode ? `&postcode=${postcode}` : ""}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            direction === "offering_truck"
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          Trucks with backload space
        </Link>
        <Link
          href={`/freight?direction=need_freight${postcode ? `&postcode=${postcode}` : ""}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            direction === "need_freight"
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          Loads needing a truck
        </Link>
        {[
          { code: "livestock", label: "Livestock Crates" },
          { code: "flatbed", label: "Hay / Drop-Deck / Flatbed" },
          { code: "tipper", label: "Grain Tippers" },
          { code: "b_double", label: "B-Doubles" },
        ].map((v) => (
          <Link
            key={v.code}
            href={`/freight?vehicle_type=${vehicle === v.code ? "" : v.code}${direction ? `&direction=${direction}` : ""}${postcode ? `&postcode=${postcode}` : ""}`}
            className={`rounded-full border px-3 py-1.5 ${
              vehicle === v.code
                ? "border-green-700 bg-green-100 text-green-900"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-green-700"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      <div className="mt-4">
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

        <SearchAlertBox
          vertical="freight"
          signal={vehicle || direction || "all"}
          signalLabel={
            vehicle
              ? `${vehicle.replace(/_/g, " ")} freight`
              : direction === "offering_truck"
                ? "trucks with backload space"
                : direction === "need_freight"
                  ? "loads needing a truck"
                  : "freight & backload runs"
          }
          postcode={postcode}
        />
      </div>

      <div className="mt-6">
        {!listings || listings.length === 0 ? (
          freightCounts.total === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-green-300 bg-green-50/70 p-6">
                <span className="inline-block rounded-full bg-green-700 px-3 py-0.5 text-xs font-semibold text-white">
                  For Truckies &amp; Carriers
                </span>
                <h2 className="mt-3 text-lg font-bold text-neutral-900">
                  Got an empty run or backload deck space?
                </h2>
                <p className="mt-2 text-sm text-neutral-700">
                  Post your origin, destination, dates and rig type (livestock crate, drop-deck,
                  tipper, B-double, tray) so farms along your route can fill the backload directly.
                </p>
                <div className="mt-4">
                  <Link
                    href="/post/freight"
                    className="inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
                  >
                    Post available truck space →
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-950">
                  For Farms &amp; Buyers
                </span>
                <h2 className="mt-3 text-lg font-bold text-neutral-900">
                  Need livestock, hay, grain, fencing or machinery moved?
                </h2>
                <p className="mt-2 text-sm text-neutral-700">
                  Post pickup and drop-off postcodes, load weight/decks and dates so carriers with
                  trucks in the area can quote you directly — zero broker margin.
                </p>
                <div className="mt-4">
                  <Link
                    href="/post/freight"
                    className="inline-flex items-center justify-center rounded-xl border border-green-700 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 hover:bg-green-50"
                  >
                    Post a load needing freight →
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
              <p className="text-sm font-semibold text-neutral-800">No freight listings match those filters.</p>
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
            {listings.map((l) => {
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

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        baseHref={`/freight${filterQS ? `?${filterQS}` : ""}`}
      />
    </div>
  );
}
