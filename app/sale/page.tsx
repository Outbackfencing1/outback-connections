import Link from "next/link";
import { liveListingCount } from "@/lib/live-counts";
import { browseRobots, hasFilterParams } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { getCategoryCounts } from "@/lib/category-counts";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";
import { logSearch } from "@/lib/analytics";
import { relativeTime, teaser } from "@/lib/format";
import {
  COMMODITY_GROUPS,
  DELIVERY,
  DELIVERY_LABELS,
  commodityLabel,
  priceLine,
  quantityLine,
  type Delivery,
} from "@/lib/sale";

// Noindex while the section is empty (it's hidden from the nav then) or
// filtered; see browseRobots().
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [liveCount, resolvedSearchParams] = await Promise.all([
    liveListingCount({ kinds: ["for_sale"] }),
    searchParams,
  ]);
  return {
    alternates: { canonical: "/sale" },
    title: "Livestock, Hay, Grain & Gear For Sale — Outback Connections",
    description:
      "Livestock, hay, grain, machinery and gear for sale across rural Australia. Free to browse, no commission, contact the seller directly.",
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

type SaleDetailRow = {
  price_cents: number | null;
  price_type: string;
  quantity: number | null;
  unit: string | null;
  condition: string;
  delivery: string;
  sold_at: string | null;
  sub_category?: string | null;
  harvest_season?: string | null;
};

type SaleListingRow = {
  anonymised_id: string;
  slug: string;
  kind: string;
  title: string;
  description: string;
  postcode: string;
  state: string | null;
  created_at: string;
  category: { slug: string; label: string } | { slug: string; label: string }[] | null;
  sale_details: SaleDetailRow | SaleDetailRow[] | null;
};

export default async function SaleBrowsePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const supabase = createClient();

  const postcode = getStr(sp, "postcode").trim();
  const rawCategory = getStr(sp, "category").trim();
  const category = /^[0-9a-f-]{36}$/i.test(rawCategory) ? rawCategory : "";
  const subCategory = getStr(sp, "sub_category").trim();
  const rawDelivery = getStr(sp, "delivery").trim();
  const delivery = (DELIVERY as readonly string[]).includes(rawDelivery) ? rawDelivery : "";
  const page = Math.max(1, parseInt(getStr(sp, "page") || "1", 10) || 1);

  const [{ data: cats }, counts] = await Promise.all([
    supabase.from("categories").select("id, slug, label").eq("pillar", "sale").eq("active", true).order("sort_order"),
    getCategoryCounts("sale"),
  ]);

  const nowIso = new Date().toISOString();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at,
      category:categories(slug, label),
      sale_details!inner(price_cents, price_type, quantity, unit, condition, delivery, sold_at, sub_category, harvest_season)
    `,
      { count: "exact" }
    )
    .eq("kind", "for_sale")
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (postcode) query = query.like("postcode", `${postcode}%`);
  if (category) query = query.eq("category_id", category);
  if (subCategory) query = query.eq("sale_details.sub_category", subCategory);
  if (delivery) query = query.eq("sale_details.delivery", delivery);

  let { data: rawListings, count, error: queryErr } = await query.range(from, to);

  if (queryErr) {
    let fallback = supabase
      .from("listings")
      .select(
        `
        anonymised_id, slug, kind, title, description, postcode, state, created_at,
        category:categories(slug, label),
        sale_details!inner(price_cents, price_type, quantity, unit, condition, delivery, sold_at)
      `,
        { count: "exact" }
      )
      .eq("kind", "for_sale")
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });
    if (postcode) fallback = fallback.like("postcode", `${postcode}%`);
    if (category) fallback = fallback.eq("category_id", category);
    if (delivery) fallback = fallback.eq("sale_details.delivery", delivery);
    const fbRes = await fallback.range(from, to);
    rawListings = fbRes.data as typeof rawListings;
    count = fbRes.count;
  }

  const listings = (rawListings ?? []) as unknown as SaleListingRow[];
  const total = count ?? 0;

  if (page === 1) {
    await logSearch({
      vertical: "sale",
      filters: {
        postcode: postcode || null,
        category: category || null,
        sub_category: subCategory || null,
        delivery: delivery || null,
      },
      resultCount: total,
      postcode: postcode || null,
    });
  }
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries({ postcode, category, sub_category: subCategory, delivery }).filter(([, v]) => v)
    )
  ).toString();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Livestock, Harvest &amp; Gear</h1>
        <Link
          href="/post/sale"
          className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Sell something
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Cattle, sheep, lucerne &amp; cereal hay, grain, machinery and fencing gear across rural
        Australia. Free to browse, zero commission — contact the seller directly.
      </p>

      <div className="mt-6">
        <FilterBar action="/sale" postcode={postcode} resetHref="/sale">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Category</span>
            <select
              name="category"
              defaultValue={category}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All categories</option>
              {(cats ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({counts.byCategory[c.id] ?? 0})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Stock, crop or gear type</span>
            <select
              name="sub_category"
              defaultValue={subCategory}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All types</option>
              {COMMODITY_GROUPS.map((g) => (
                <optgroup key={g.categorySlug} label={g.groupLabel}>
                  {g.options.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Pickup / delivery</span>
            <select
              name="delivery"
              defaultValue={delivery}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Any</option>
              {DELIVERY.map((d) => (
                <option key={d} value={d}>
                  {DELIVERY_LABELS[d as Delivery]}
                </option>
              ))}
            </select>
          </label>
        </FilterBar>
      </div>

      <div className="mt-6">
        {!listings || listings.length === 0 ? (
          counts.total === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
              <p className="text-sm font-semibold text-neutral-800">Nothing for sale yet.</p>
              <p className="mt-2 text-sm text-neutral-700">
                Be the first.{" "}
                <Link href="/post/sale" className="font-medium text-green-800 underline">
                  Posting livestock, hay, grain or gear
                </Link>{" "}
                is free and takes two minutes.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
              <p className="text-sm text-neutral-700">Nothing matches the filters.</p>
              <p className="mt-2 text-xs text-neutral-500">
                Try a wider postcode or remove a filter.
              </p>
            </div>
          )
        ) : (
          <ul className="space-y-4">
            {listings.map((l) => {
              const cat = Array.isArray(l.category) ? l.category[0] ?? null : l.category;
              const d = Array.isArray(l.sale_details) ? l.sale_details[0] : l.sale_details;
              const qty = d ? quantityLine({ quantity: d.quantity, unit: d.unit }) : null;
              const subLabel = d ? commodityLabel(d.sub_category) : null;
              return (
                <li key={l.anonymised_id}>
                  <Link
                    href={`/sale/${l.slug}`}
                    className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <h3 className="min-w-0 text-base font-semibold text-neutral-900 [overflow-wrap:anywhere] sm:text-lg">
                        {l.title}
                      </h3>
                      {d && (
                        <span className="shrink-0 self-start rounded bg-green-100 px-2 py-0.5 text-sm font-semibold text-green-900 sm:self-auto">
                          {priceLine({ price_cents: d.price_cents, price_type: d.price_type, unit: d.unit })}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">
                      {subLabel ?? cat?.label ?? "—"}
                      {qty ? ` · ${qty}` : ""}
                      {d?.harvest_season ? ` · ${d.harvest_season}` : ""} ·{" "}
                      {l.state ? `${l.postcode} ${l.state}` : `Postcode ${l.postcode}`} ·{" "}
                      {relativeTime(l.created_at)}
                    </p>
                    <p className="mt-3 text-sm text-neutral-700">{teaser(l.description, 160)}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} baseHref={`/sale${qs ? `?${qs}` : ""}`} />
    </div>
  );
}
