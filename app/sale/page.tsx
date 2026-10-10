import Link from "next/link";
import { liveListingCount } from "@/lib/live-counts";
import { browseRobots, hasFilterParams } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { getCategoryCounts } from "@/lib/category-counts";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";
import { logSearch } from "@/lib/analytics";
import { relativeTime, teaser } from "@/lib/format";
import { priceLine, quantityLine } from "@/lib/sale";

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
    title: "For sale — Outback Connections",
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

export default async function SaleBrowsePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const supabase = createClient();

  const postcode = getStr(sp, "postcode").trim();
  const rawCategory = getStr(sp, "category").trim();
  const category = /^[0-9a-f-]{36}$/i.test(rawCategory) ? rawCategory : "";
  const page = Math.max(1, parseInt(getStr(sp, "page") || "1", 10) || 1);

  const [{ data: cats }, counts] = await Promise.all([
    supabase.from("categories").select("id, slug, label").eq("pillar", "sale").eq("active", true).order("sort_order"),
    getCategoryCounts("sale"),
  ]);

  let query = supabase
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
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (postcode) query = query.like("postcode", `${postcode}%`);
  if (category) query = query.eq("category_id", category);

  const from = (page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);
  const { data: listings, count } = await query;
  const total = count ?? 0;

  if (page === 1) {
    await logSearch({
      vertical: "sale",
      filters: { postcode: postcode || null, category: category || null },
      resultCount: total,
      postcode: postcode || null,
    });
  }
  const qs = new URLSearchParams(Object.fromEntries(Object.entries({ postcode, category }).filter(([, v]) => v))).toString();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">For sale</h1>
        <Link
          href="/post/sale"
          className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Sell something
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Livestock, hay, grain, machinery, gear. Free to browse, no commission. Sign in to see the
        seller&apos;s contact details.
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
                  Posting something for sale
                </Link>{" "}
                is free and takes a few minutes.
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
              return (
                <li key={l.anonymised_id}>
                  <Link
                    href={`/sale/${l.slug}`}
                    className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">{l.title}</h3>
                      {d && (
                        <span className="shrink-0 rounded bg-green-100 px-2 py-0.5 text-sm font-semibold text-green-900">
                          {priceLine({ price_cents: d.price_cents, price_type: d.price_type, unit: d.unit })}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">
                      {cat?.label ?? "—"}
                      {qty ? ` · ${qty}` : ""} ·{" "}
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
