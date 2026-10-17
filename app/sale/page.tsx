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
  side?: string | null;
  title: string;
  description: string;
  postcode: string;
  state: string | null;
  created_at: string;
  category: { slug: string; label: string } | { slug: string; label: string }[] | null;
  sale_details: SaleDetailRow | SaleDetailRow[] | null;
};

const QUICK_SALE_CHIPS: { code: string; label: string }[] = [
  { code: "cattle-steers", label: "Cattle (Steers & Heifers)" },
  { code: "cattle-breeders", label: "Cows & Calves" },
  { code: "sheep-lambs", label: "Sheep & Lambs" },
  { code: "lucerne-hay", label: "Lucerne Hay" },
  { code: "wheaten-hay", label: "Wheaten Hay" },
  { code: "oaten-hay", label: "Oaten Hay" },
  { code: "silage", label: "Silage" },
  { code: "feed-barley", label: "Feed Barley" },
  { code: "wheat", label: "Wheat" },
  { code: "canola", label: "Canola" },
  { code: "tractors", label: "Tractors" },
  { code: "headers-harvesters", label: "Headers & Harvesters" },
  { code: "fencing-materials", label: "Mesh, Pickets & Gates" },
];

export default async function SaleBrowsePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const supabase = createClient();

  const postcode = getStr(sp, "postcode").trim();
  const rawCategory = getStr(sp, "category").trim();
  const category = /^[0-9a-f-]{36}$/i.test(rawCategory) ? rawCategory : "";
  const subCategory = getStr(sp, "sub_category").trim();
  const rawSide = getStr(sp, "side").trim();
  const side = rawSide === "supply" || rawSide === "demand" ? rawSide : "";
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
      anonymised_id, slug, kind, side, title, description, postcode, state, created_at,
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
  if (side) query = query.eq("side", side);
  if (subCategory) query = query.eq("sale_details.sub_category", subCategory);
  if (delivery) query = query.eq("sale_details.delivery", delivery);

  let { data: rawListings, count, error: queryErr } = await query.range(from, to);

  if (queryErr) {
    let fallback = supabase
      .from("listings")
      .select(
        `
        anonymised_id, slug, kind, side, title, description, postcode, state, created_at,
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
    if (side) fallback = fallback.eq("side", side);
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
        side: side || null,
        sub_category: subCategory || null,
        delivery: delivery || null,
      },
      resultCount: total,
      postcode: postcode || null,
    });
  }
  const qs = buildSaleQs({
    postcode,
    category,
    side,
    sub_category: subCategory,
    delivery,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Livestock, Harvest &amp; Gear</h1>
          <p className="mt-2 text-sm text-neutral-700">
            Cattle, sheep, lucerne &amp; cereal hay, grain, machinery and fencing gear across rural
            Australia. Free to browse, zero commission — contact the property directly.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Link
            href="/post/sale?side=supply"
            className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
          >
            Sell stock, hay or gear
          </Link>
          <Link
            href="/post/sale?side=demand"
            className="rounded-lg border border-green-700 bg-white px-3 py-1.5 text-sm font-semibold text-green-800 shadow-sm hover:bg-green-50"
          >
            Post wanted to buy
          </Link>
        </div>
      </div>

      {/* Quick side tabs */}
      <nav aria-label="Marketplace side" className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
        <Link
          href={`/sale${buildSaleQs({ postcode, category, sub_category: subCategory, delivery }) ? `?${buildSaleQs({ postcode, category, sub_category: subCategory, delivery })}` : ""}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            side === ""
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          All livestock, harvest &amp; gear
        </Link>
        <Link
          href={`/sale?${buildSaleQs({ postcode, category, side: "supply", sub_category: subCategory, delivery })}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            side === "supply"
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          For sale (Available)
        </Link>
        <Link
          href={`/sale?${buildSaleQs({ postcode, category, side: "demand", sub_category: subCategory, delivery })}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            side === "demand"
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          Wanted to buy (Chasing)
        </Link>
      </nav>

      {/* Quick commodity chips */}
      <nav aria-label="Filter by stock, crop or gear" className="mt-3 flex flex-wrap gap-1.5">
        {QUICK_SALE_CHIPS.map((chip) => {
          const active = subCategory === chip.code;
          return (
            <Link
              key={chip.code}
              href={`/sale?${buildSaleQs({
                postcode,
                category,
                side,
                sub_category: active ? "" : chip.code,
                delivery,
              })}`}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                active
                  ? "border-green-700 bg-green-100 text-green-900"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-green-700 hover:bg-green-50"
              }`}
            >
              {chip.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4">
        <FilterBar action="/sale" postcode={postcode} resetHref="/sale">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Looking for</span>
            <select
              name="side"
              defaultValue={side}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Both for sale &amp; wanted</option>
              <option value="supply">For sale (Available)</option>
              <option value="demand">Wanted to buy (Chasing)</option>
            </select>
          </label>

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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-green-300 bg-green-50/70 p-6">
                <span className="inline-block rounded-full bg-green-700 px-3 py-0.5 text-xs font-semibold text-white">
                  For Sellers &amp; Growers
                </span>
                <h2 className="mt-3 text-lg font-bold text-neutral-900">
                  Got livestock, hay, grain or machinery to sell?
                </h2>
                <p className="mt-2 text-sm text-neutral-700">
                  List cattle, sheep, lucerne or cereal hay, feed grain, tractors, headers or
                  fencing gear with your price, quantity and pickup/delivery options. 100% free,
                  0% commission.
                </p>
                <div className="mt-4">
                  <Link
                    href="/post/sale?side=supply"
                    className="inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
                  >
                    Sell stock, hay or gear →
                  </Link>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-6">
                <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-950">
                  For Buyers &amp; Feedlots
                </span>
                <h2 className="mt-3 text-lg font-bold text-neutral-900">
                  Chasing hay, feed grain, cattle, sheep or gear?
                </h2>
                <p className="mt-2 text-sm text-neutral-700">
                  Post a Wanted to Buy listing with the tonnes, bales or head you need and your
                  postcode so growers and properties with stock on hand can contact you directly.
                </p>
                <div className="mt-4">
                  <Link
                    href="/post/sale?side=demand"
                    className="inline-flex items-center justify-center rounded-xl border border-green-700 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 hover:bg-green-50"
                  >
                    Post wanted to buy →
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
              <p className="text-sm font-semibold text-neutral-800">
                Nothing matches those exact filters yet.
              </p>
              <p className="mt-2 text-sm text-neutral-700">
                Try a wider postcode, clear a filter, or post what you&apos;re selling or chasing:
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-3">
                <Link
                  href="/post/sale?side=supply"
                  className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
                >
                  + Sell stock, hay or gear
                </Link>
                <Link
                  href="/post/sale?side=demand"
                  className="rounded-xl border border-green-700 bg-white px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-50"
                >
                  + Post wanted to buy
                </Link>
                <Link
                  href="/sale"
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400"
                >
                  Reset filters
                </Link>
              </div>
            </div>
          )
        ) : (
          <ul className="space-y-4">
            {listings.map((l) => {
              const cat = Array.isArray(l.category) ? l.category[0] ?? null : l.category;
              const d = Array.isArray(l.sale_details) ? l.sale_details[0] : l.sale_details;
              const qty = d ? quantityLine({ quantity: d.quantity, unit: d.unit }) : null;
              const subLabel = d ? commodityLabel(d.sub_category) : null;
              const isWanted = l.side === "demand";
              return (
                <li key={l.anonymised_id}>
                  <Link
                    href={`/sale/${l.slug}`}
                    className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            isWanted
                              ? "bg-amber-100 text-amber-950"
                              : "bg-green-100 text-green-900"
                          }`}
                        >
                          {isWanted ? "Wanted to Buy" : "For Sale"}
                        </span>
                        <h3 className="min-w-0 text-base font-semibold text-neutral-900 [overflow-wrap:anywhere] sm:text-lg">
                          {l.title}
                        </h3>
                      </div>
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

function buildSaleQs(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) usp.set(k, v);
  }
  return usp.toString();
}
