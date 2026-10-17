import Link from "next/link";
import { liveListingCount } from "@/lib/live-counts";
import { browseRobots, hasFilterParams } from "@/lib/seo";
import { createClient } from "@/lib/supabase/server";
import { getCategoryCounts } from "@/lib/category-counts";
import ListingCard from "@/components/browse/ListingCard";
import Pagination from "@/components/browse/Pagination";
import FilterBar from "@/components/browse/FilterBar";
import SearchAlertBox from "@/components/browse/SearchAlertBox";
import { logSearch } from "@/lib/analytics";
import { WORKER_TICKETS, WORKER_TICKET_LABELS, type WorkerTicket } from "@/lib/work-board";

// Noindex while the section is empty (it's hidden from the nav then) or
// filtered; see browseRobots().
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [liveCount, resolvedSearchParams] = await Promise.all([
    liveListingCount({ kinds: ["job"] }),
    searchParams,
  ]);
  return {
    alternates: { canonical: "/jobs" },
    title: "Work & Skills Board — Jobs, Drivers & Operators — Outback Connections",
    description:
      "Rural work & skills board across Australia: find truck drivers, header & machine operators, fencers, station hands and shearers, or list your skills and availability for free.",
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

type JobDetailRow = {
  direction?: string | null;
  work_type?: string | null;
  pay_type?: string | null;
  pay_amount?: number | null;
  tickets?: string[] | null;
  travel_willingness?: string | null;
  experience_years?: number | null;
};

type JobListingRow = {
  anonymised_id: string;
  slug: string;
  kind: string;
  title: string;
  description: string;
  postcode: string;
  state: string | null;
  created_at: string;
  data_source: string | null;
  source_platform: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  category: { slug: string; label: string } | { slug: string; label: string }[] | null;
  business:
    | {
        claim_status?: string;
        contact_phone?: string | null;
        contact_email?: string | null;
        website_url?: string | null;
        suburb?: string | null;
        outback_verified?: boolean | null;
      }
    | {
        claim_status?: string;
        contact_phone?: string | null;
        contact_email?: string | null;
        website_url?: string | null;
        suburb?: string | null;
        outback_verified?: boolean | null;
      }[]
    | null;
  job_details: JobDetailRow | JobDetailRow[] | null;
};

export default async function JobsBrowsePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = createClient();

  const postcode = getStr(resolvedSearchParams, "postcode").trim();
  const rawCategory = getStr(resolvedSearchParams, "category").trim();
  const category = /^[0-9a-f-]{36}$/i.test(rawCategory) ? rawCategory : "";
  const rawDirection = getStr(resolvedSearchParams, "direction").trim();
  const direction =
    rawDirection === "hiring" || rawDirection === "available_for_work" ? rawDirection : "";
  const rawTicket = getStr(resolvedSearchParams, "ticket").trim();
  const ticket = (WORKER_TICKETS as readonly string[]).includes(rawTicket) ? rawTicket : "";
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

  const nowIso = new Date().toISOString();
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Query with extended work-board columns; fall back gracefully if the migration
  // hasn't been applied to the target DB yet.
  let query = supabase
    .from("listings")
    .select(
      `
      anonymised_id, slug, kind, title, description, postcode, state, created_at, data_source, source_platform, contact_phone, contact_email,
      category:categories(slug, label),
      business:businesses(claim_status, contact_phone, contact_email, website_url, suburb, outback_verified),
      job_details!inner(direction, work_type, pay_type, pay_amount, tickets, travel_willingness, experience_years)
    `,
      { count: "exact" }
    )
    .eq("kind", "job")
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (postcode) query = query.like("postcode", `${postcode}%`);
  if (category) query = query.eq("category_id", category);
  if (direction) query = query.eq("job_details.direction", direction);
  if (ticket) query = query.contains("job_details.tickets", [ticket]);
  if (payType) query = query.eq("job_details.pay_type", payType);

  let { data: rawListings, count, error: queryErr } = await query.range(from, to);

  if (queryErr) {
    let fallback = supabase
      .from("listings")
      .select(
        `
        anonymised_id, slug, kind, title, description, postcode, state, created_at, data_source, source_platform, contact_phone, contact_email,
        category:categories(slug, label),
        business:businesses(claim_status, contact_phone, contact_email, website_url, suburb, outback_verified),
        job_details!inner(work_type, pay_type, pay_amount)
      `,
        { count: "exact" }
      )
      .eq("kind", "job")
      .eq("status", "active")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });
    if (postcode) fallback = fallback.like("postcode", `${postcode}%`);
    if (category) fallback = fallback.eq("category_id", category);
    if (payType) fallback = fallback.eq("job_details.pay_type", payType);
    const fbRes = await fallback.range(from, to);
    rawListings = fbRes.data as typeof rawListings;
    count = fbRes.count;
  }

  const listings = (rawListings ?? []) as unknown as JobListingRow[];
  const total = count ?? 0;

  if (page === 1) {
    await logSearch({
      vertical: "job",
      filters: {
        postcode: postcode || null,
        category: category || null,
        direction: direction || null,
        ticket: ticket || null,
        pay_type: payType || null,
      },
      resultCount: total,
      postcode: postcode || null,
    });
  }
  const filterQS = buildQs({
    postcode,
    category,
    direction,
    ticket,
    pay_type: payType,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Work &amp; Skills Board</h1>
          <p className="mt-2 text-sm text-neutral-700">
            Find truck drivers, machine &amp; header operators, fencers, shearers and station hands
            — or put your own skills and tickets on the board. Free to browse and post.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Link
            href="/post/job?direction=available_for_work"
            className="rounded-lg border border-green-700 bg-white px-3 py-1.5 text-sm font-semibold text-green-800 shadow-sm hover:bg-green-50"
          >
            List your skills
          </Link>
          <Link
            href="/post/job?direction=hiring"
            className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
          >
            Post a job
          </Link>
        </div>
      </div>

      {/* Quick direction tabs */}
      <nav aria-label="Work board side" className="mt-5 flex flex-wrap gap-2 text-xs font-medium">
        <Link
          href={`/jobs${buildQs({ postcode, category, ticket, pay_type: payType }) ? `?${buildQs({ postcode, category, ticket, pay_type: payType })}` : ""}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            direction === ""
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          All work &amp; workers
        </Link>
        <Link
          href={`/jobs?${buildQs({ postcode, category, direction: "available_for_work", ticket, pay_type: payType })}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            direction === "available_for_work"
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          Workers &amp; operators available
        </Link>
        <Link
          href={`/jobs?${buildQs({ postcode, category, direction: "hiring", ticket, pay_type: payType })}`}
          className={`rounded-full border px-3.5 py-1.5 ${
            direction === "hiring"
              ? "border-green-700 bg-green-700 text-white"
              : "border-neutral-300 bg-white text-neutral-700 hover:border-green-700"
          }`}
        >
          Jobs hiring
        </Link>
      </nav>

      {/* Quick ticket / licence chips */}
      <nav aria-label="Filter by ticket or skill" className="mt-3 flex flex-wrap gap-1.5">
        {WORKER_TICKETS.map((t) => {
          const active = ticket === t;
          return (
            <Link
              key={t}
              href={`/jobs?${buildQs({
                postcode,
                category,
                direction,
                ticket: active ? "" : t,
                pay_type: payType,
              })}`}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                active
                  ? "border-green-700 bg-green-100 text-green-900"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-green-700 hover:bg-green-50"
              }`}
            >
              {WORKER_TICKET_LABELS[t as WorkerTicket]}
            </Link>
          );
        })}
      </nav>

      <div className="mt-4">
        <FilterBar action="/jobs" postcode={postcode} resetHref="/jobs">
          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Looking for</span>
            <select
              name="direction"
              defaultValue={direction}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Both jobs &amp; available workers</option>
              <option value="available_for_work">Workers &amp; operators available</option>
              <option value="hiring">Farms &amp; businesses hiring</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Role / Category</span>
            <select
              name="category"
              defaultValue={category}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">All roles</option>
              {(cats ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({jobCounts.byCategory[c.id] ?? 0})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Ticket / Skill</span>
            <select
              name="ticket"
              defaultValue={ticket}
              className="mt-1 block w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm"
            >
              <option value="">Any ticket or skill</option>
              {WORKER_TICKETS.map((t) => (
                <option key={t} value={t}>
                  {WORKER_TICKET_LABELS[t as WorkerTicket]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-neutral-700">Pay / Rate type</span>
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

        <SearchAlertBox
          vertical="job"
          signal={ticket || direction || "all"}
          signalLabel={
            ticket
              ? WORKER_TICKET_LABELS[ticket as WorkerTicket]
              : direction === "available_for_work"
                ? "available rural workers & operators"
                : direction === "hiring"
                  ? "rural jobs hiring"
                  : "work & skills"
          }
          postcode={postcode}
        />
      </div>

      <div className="mt-6">
        {!listings || listings.length === 0 ? (
          jobCounts.total === 0 ? <NothingYet /> : <EmptyState />
        ) : (
          <ul className="space-y-4">
            {listings.map((l) => {
              const jd = Array.isArray(l.job_details)
                ? l.job_details[0] ?? null
                : l.job_details ?? null;
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
                      job_meta: jd,
                    }}
                  />
                </li>
              );
            })}
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
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-green-300 bg-green-50/70 p-6">
          <span className="inline-block rounded-full bg-green-700 px-3 py-0.5 text-xs font-semibold text-white">
            For Drivers, Operators &amp; Rural Workers
          </span>
          <h2 className="mt-3 text-lg font-bold text-neutral-900">
            Available for work? Put your skills &amp; tickets on the board.
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Tick your licences (MC/HC/HR truck, header, tractor + GPS, excavator, fencing, shearing,
            dogs, welding), set your travel radius and hourly/day rate, and let properties contact
            you directly.
          </p>
          <div className="mt-4">
            <Link
              href="/post/job?direction=available_for_work"
              className="inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
            >
              List your skills free →
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-950">
            For Farms, Stations &amp; Contractors
          </span>
          <h2 className="mt-3 text-lg font-bold text-neutral-900">
            Chasing a driver, machine operator, fencer or station hand?
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Post what you need, the tickets required, pay rate, start date and whether quarters or
            camp accommodation are provided. Free on Day 1, zero recruitment fees.
          </p>
          <div className="mt-4">
            <Link
              href="/post/job?direction=hiring"
              className="inline-flex items-center justify-center rounded-xl border border-green-700 bg-white px-4 py-2.5 text-sm font-semibold text-green-800 hover:bg-green-50"
            >
              Post a job free →
            </Link>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-neutral-500">
        Looking for an established fencing contracting business instead?{" "}
        <Link href="/services/fencing-contractor" className="font-medium text-green-800 underline">
          Browse Fencing Contractors under Services →
        </Link>
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-8 text-center">
      <p className="text-sm font-semibold text-neutral-800">
        No listings match those exact filters yet.
      </p>
      <p className="mt-2 text-sm text-neutral-700">
        Widen the postcode, clear a filter, or post straight onto the board so people in that region
        can find you:
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        <Link
          href="/post/job?direction=available_for_work"
          className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
        >
          + List your skills
        </Link>
        <Link
          href="/post/job?direction=hiring"
          className="rounded-xl border border-green-700 bg-white px-4 py-2 text-sm font-semibold text-green-800 hover:bg-green-50"
        >
          + Post a job
        </Link>
        <Link
          href="/jobs"
          className="rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:border-neutral-400"
        >
          Reset filters
        </Link>
      </div>
    </div>
  );
}
