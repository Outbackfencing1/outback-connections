import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCategoryCounts } from "@/lib/category-counts";
import ListingCard from "@/components/browse/ListingCard";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";
import { logSearch } from "@/lib/analytics";

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
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = createClient();

  const postcode = getStr(resolvedSearchParams, "postcode").trim();
  const category = getStr(resolvedSearchParams, "category").trim();
  const payType = getStr(resolvedSearchParams, "pay_type").trim();
  const page = Math.max(1, parseInt(getStr(resolvedSearchParams, "page") || "1", 10) || 1);

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
      anonymised_id, slug, kind, title, description, postcode, state, created_at, data_source, source_platform,
      category:categories(slug, label),
      business:businesses(claim_status),
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
  if (page === 1) {
    await logSearch({
      vertical: "job",
      filters: { postcode: postcode || null, category: category || null, pay_type: payType || null },
      resultCount: total,
      postcode: postcode || null,
    });
  }
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
          jobCounts.total === 0 ? <NothingYet /> : <EmptyState />
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
        {(listings ?? []).some((l) => l.source_platform === "adzuna") && (
          <p className="mt-4 text-xs text-neutral-500">
            Some ads syndicated — jobs by{" "}
            <a
              href="https://www.adzuna.com.au"
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="underline"
            >
              Adzuna
            </a>
            .
          </p>
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

function NothingYet() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
      <p className="text-sm font-semibold text-neutral-800">No jobs listed yet.</p>
      <p className="mt-2 text-sm text-neutral-700">
        Be the first.{" "}
        <Link href="/post/job" className="font-medium text-green-800 underline">
          Post a job
        </Link>{" "}
        is free and takes a few minutes.
      </p>
      <p className="mt-3 text-xs text-neutral-500">
        After a fencing contractor instead?{" "}
        <Link href="/services/fencing-contractor" className="underline">
          They&apos;re under Services
        </Link>
        .
      </p>
    </div>
  );
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
