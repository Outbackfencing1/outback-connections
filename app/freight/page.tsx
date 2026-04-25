import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ListingCard from "@/components/browse/ListingCard";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";

export const metadata = {
  title: "Freight — Outback Connections",
  description:
    "Rural freight: livestock, hay, grain, machinery. Farmers needing freight, truckies with available runs. Free to browse.",
};

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
  searchParams: SearchParams;
}) {
  const supabase = createClient();

  const postcode = getStr(searchParams, "postcode").trim();
  const direction = getStr(searchParams, "direction").trim();
  const vehicle = getStr(searchParams, "vehicle_type").trim();
  const page = Math.max(1, parseInt(getStr(searchParams, "page") || "1", 10) || 1);

  let query = supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at,
      category:categories(slug, label),
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

  const { data: listings, count } = await query;

  const total = count ?? 0;
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
