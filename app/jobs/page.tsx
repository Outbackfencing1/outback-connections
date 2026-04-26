import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCategoryCounts } from "@/lib/category-counts";
import ListingCard from "@/components/browse/ListingCard";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";

export const metadata = {
  title: "Jobs — Outback Connections",
  description:
    "Browse rural jobs across Australia: station hands, fencing, harvest, mustering, dairy. Free to browse.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

function getStr(p: SearchParams, key: string): string {
  const v = p[key];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function JobsBrowsePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const supabase = createClient();

  const postcode = getStr(searchParams, "postcode").trim();
  const category = getStr(searchParams, "category").trim();
  const payType = getStr(searchParams, "pay_type").trim();
  const page = Math.max(1, parseInt(getStr(searchParams, "page") || "1", 10) || 1);

  // Categories for the filter dropdown, with active counts.
  const [{ data: cats }, jobCounts] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, label")
      .eq("pillar", "jobs")
      .eq("active", true)
      .order("sort_order"),
    getCategoryCounts("jobs"),
  ]);

  // Build the listings query
  let query = supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at,
      category:categories(slug, label),
      job_details!inner(work_type, pay_type, pay_amount)
    `,
      { count: "exact" }
    )
    .eq("kind", "job")
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (postcode) query = query.like("postcode", `${postcode}%`);
  if (category) query = query.eq("category_id", category);
  if (payType) query = query.eq("job_details.pay_type", payType);

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data: listings, count } = await query;

  const total = count ?? 0;
  const filterQS = buildQs({ postcode, category, pay_type: payType });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Jobs</h1>
        <Link
          href="/post/job"
          className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
        >
          Post a job
        </Link>
      </div>
      <p className="mt-2 text-sm text-neutral-700">
        Rural work — station hands, fencers, harvest, mustering, dairy.
        Free to browse. Sign in to see contact details.
      </p>

      <div className="mt-6">
        <FilterBar action="/jobs" postcode={postcode} resetHref="/jobs">
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
                  {c.label} ({jobCounts.byCategory[c.id] ?? 0})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Pay type</span>
            <select
              name="pay_type"
              defaultValue={payType}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Any</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="negotiable">Negotiable</option>
              <option value="not_specified">Not specified</option>
            </select>
          </label>
        </FilterBar>
      </div>

      <div className="mt-6">
        {!listings || listings.length === 0 ? (
          <EmptyState />
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
        baseHref={`/jobs${filterQS ? `?${filterQS}` : ""}`}
      />
    </div>
  );
}

function buildQs(params: Record<string, string>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) usp.set(k, v);
  }
  return usp.toString();
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
      <p className="text-sm text-neutral-700">No jobs match the filters.</p>
      <p className="mt-2 text-xs text-neutral-500">
        Try widening the postcode or removing a filter. Or{" "}
        <Link href="/post/job" className="underline">
          post a job
        </Link>
        .
      </p>
    </div>
  );
}
