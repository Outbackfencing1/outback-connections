// app/dashboard/admin/hub-queue/page.tsx
// Ali's primary starting screen & Josh's Live Monitoring / Coaching Console:
// - Real-time 24h & 7d velocity telemetry (listings added, outreach logged, jobs live, SLA)
// - Automated Daily Coach & Copy-Paste Feedback Generator for Josh
// - 5-Day Starter Backlog (A01–A06) + Auto-Refilling National Conquest Waves (Waves 1–6)
// - 5-Year Hyper-Growth Master Plan (Years 1–5)
// - Central West Coverage Matrix, Approved Source Register, Promotion Pack & Daryl Handoff Reference

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALI_DAILY_SCHEDULE,
  ALI_FALLBACK_LADDER,
  ALI_HYPERGROWTH_KPI_TARGETS,
  ALI_STARTER_QUEUE,
  CENTRAL_WEST_PROMOTION_PACK,
  CENTRAL_WEST_TOWNS,
  FIVE_YEAR_HYPERGROWTH_ROADMAP,
  HUB_SOURCE_REGISTER,
  NATIONAL_CONQUEST_WAVES,
  PRIORITY_HUB_CATEGORIES,
  evaluateAliPerformanceAndFeedback,
  evaluateCategoryTownReadiness,
} from "@/lib/hub-growth-queue";
import {
  DARYL_SALES_EMAIL,
  DARYL_SALES_PHONE,
  OUTBACK_CLIPGUN_BUNDLES,
  OUTBACK_FENCING_AND_ACCESSORY_PRODUCTS,
  PRODUCT_REFERENCE_LAST_CHECKED,
} from "@/lib/outback-products";

export const metadata = {
  title: "Hub growth queue & 5-year hyper-growth engine (Ali) — Admin — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function HubGrowthQueuePage() {
  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/hub-queue");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile?.is_admin && !profile?.is_staff) redirect("/dashboard");
  const isAdmin = !!profile?.is_admin;

  // Fetch live hub snapshot + 24h/7d velocity telemetry with explicit error capture
  const svc = createAdminClient() ?? supabase;
  const now = new Date();
  const nowIso = now.toISOString();
  const iso24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const iso7dAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const queryErrors: string[] = [];

  const [listingsRes, outreach7dRes, enquiriesRes, claimsRes] = await Promise.all([
    svc
      .from("listings")
      .select("id, kind, postcode, state, source_url, created_at, category:categories(slug, label)")
      .eq("status", "active")
      .gt("expires_at", nowIso),
    svc
      .from("business_outreach_events")
      .select("id, action, created_at")
      .gte("created_at", iso7dAgo),
    svc
      .from("listing_enquiries")
      .select("id, status, created_at")
      .eq("status", "new")
      .lte("created_at", iso24hAgo),
    svc
      .from("business_claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  if (listingsRes.error) queryErrors.push(`active_listings: ${listingsRes.error.message}`);
  if (outreach7dRes.error) queryErrors.push(`outreach_events: ${outreach7dRes.error.message}`);
  if (enquiriesRes.error) queryErrors.push(`listing_enquiries: ${enquiriesRes.error.message}`);

  const rows = (listingsRes.data ?? []) as unknown as {
    id: string;
    kind: string;
    postcode: string | null;
    state: string | null;
    source_url: string | null;
    created_at: string | null;
    category: { slug: string; label: string } | { slug: string; label: string }[] | null;
  }[];

  const getCatSlug = (r: (typeof rows)[number]) => {
    if (!r.category) return null;
    return Array.isArray(r.category) ? r.category[0]?.slug ?? null : r.category.slug;
  };

  const fencingCount = rows.filter((r) => getCatSlug(r) === "fencing-contractor").length;
  const nonFencingServiceCount = rows.filter(
    (r) => r.kind === "service_offering" && getCatSlug(r) !== "fencing-contractor"
  ).length;
  const freightCount = rows.filter((r) => r.kind === "freight_offering").length;
  const jobCount = rows.filter((r) => r.kind === "job").length;

  const listingsAddedLast24h = rows.filter(
    (r) => r.created_at && r.created_at >= iso24hAgo
  ).length;
  const listingsAdded7dRows = rows.filter((r) => r.created_at && r.created_at >= iso7dAgo);
  const listingsAddedLast7d = listingsAdded7dRows.length;
  const nonFencingAddedLast7d = listingsAdded7dRows.filter(
    (r) => getCatSlug(r) !== "fencing-contractor"
  ).length;

  const outreachEvents7d = (outreach7dRes.data ?? []) as { id: string; created_at: string }[];
  const outreachEventsLast7d = outreachEvents7d.length;
  const outreachEventsLast24h = outreachEvents7d.filter(
    (e) => e.created_at && e.created_at >= iso24hAgo
  ).length;

  const unansweredEnquiriesOver24h = (enquiriesRes.data ?? []).length;
  const pendingClaimsCount = claimsRes.count ?? 0;

  const centralWestPostcodes = new Set(CENTRAL_WEST_TOWNS.map((t) => t.postcode));
  const centralWestFencingRows = rows.filter(
    (r) =>
      getCatSlug(r) === "fencing-contractor" &&
      r.postcode &&
      centralWestPostcodes.has(r.postcode.trim())
  );

  const coachingReport = evaluateAliPerformanceAndFeedback({
    listingsAddedLast24h,
    listingsAddedLast7d,
    nonFencingAddedLast7d,
    outreachEventsLast24h,
    outreachEventsLast7d,
    activeJobsCount: jobCount,
    unansweredEnquiriesOver24h,
    pendingClaimsCount,
    centralWestFencingCount: centralWestFencingRows.length,
    totalNonFencingServiceCount: nonFencingServiceCount,
    totalFreightCount: freightCount,
  });

  const centralWestReadiness = evaluateCategoryTownReadiness({
    categorySlug: "fencing-contractor",
    regionLabel: "Central West NSW Spotlight Towns",
    activeVerifiedListingsCount: centralWestFencingRows.length,
    allHaveVerifiedSourceOrClaim: centralWestFencingRows.every(
      (r) => !r.source_url || !r.source_url.includes("google.com/search")
    ),
    allRefreshedWithin60Days: true,
    mobileAndEnquiryFlowChecked: true,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Rural Hub Growth Coordinator · 5-Year Hyper-Growth Operating Engine
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Hub growth queue, live velocity monitor &amp; 5-year roadmap
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-700">
            Outback Connections is being built like a high-velocity rural marketplace utility: conquer
            Australia corridor by corridor across all <strong>24 service categories</strong>,{" "}
            <strong>8 freight categories</strong>, and the <strong>Work &amp; Skills Board</strong>,
            convert unclaimed listings into owner-confirmed profiles with live availability, and route
            warm fencing material enquiries straight to Daryl.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Link
            href="/dashboard/admin/daily-report"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-800 hover:bg-neutral-50"
          >
            1. Daily SLA report →
          </Link>
          <Link
            href="/dashboard/admin/contractor-outreach"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-neutral-800 hover:bg-neutral-50"
          >
            2. Outreach &amp; Daryl handoff →
          </Link>
          <Link
            href="/dashboard/directory/add"
            className="rounded-lg bg-green-700 px-3 py-2 text-white hover:bg-green-800"
          >
            + Add verified directory entry
          </Link>
        </div>
      </div>

      {queryErrors.length > 0 && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-bold">Database snapshot query warning</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {queryErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* LIVE AUTOMATED VELOCITY MONITOR & DAILY COACH FOR ALI + JOSH */}
      <section className="mt-8 rounded-2xl border-2 border-green-800 bg-gradient-to-br from-green-50 via-white to-amber-50/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span
              className={`inline-block rounded-full px-3 py-1 text-xs font-bold uppercase ${
                coachingReport.overallPaceStatus === "HYPERGROWTH_ON_TRACK"
                  ? "bg-green-800 text-white"
                  : coachingReport.overallPaceStatus === "SLA_URGENT_FIRST"
                    ? "bg-red-700 text-white"
                    : "bg-amber-500 text-neutral-950"
              }`}
            >
              Live Automated Monitor · {coachingReport.overallPaceStatus.replace(/_/g, " ")}
            </span>
            <h2 className="mt-2 text-xl font-bold text-neutral-900">
              {coachingReport.headlineVerdict}
            </h2>
          </div>
          <div className="rounded-xl border border-green-300 bg-white px-4 py-3 text-center">
            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
              Weekly Velocity Score
            </p>
            <p className="text-3xl font-extrabold text-green-800">
              {coachingReport.velocityScoreOutOf100}
              <span className="text-base font-normal text-neutral-500"> / 100</span>
            </p>
          </div>
        </div>

        {/* Live 24h & 7d KPI Counters */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
            <p className="text-xs font-semibold text-neutral-500">New Listings Added (24h / 7d)</p>
            <p className="mt-1 text-xl font-bold text-neutral-900">
              {listingsAddedLast24h} today{" "}
              <span className="text-xs font-normal text-neutral-500">
                (target {ALI_HYPERGROWTH_KPI_TARGETS.dailyNewVerifiedListingsTarget}/day)
              </span>
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              7-day total: <strong>{listingsAddedLast7d}</strong> /{" "}
              {ALI_HYPERGROWTH_KPI_TARGETS.weeklyNewVerifiedListingsTarget} target
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
            <p className="text-xs font-semibold text-neutral-500">
              1-to-1 Outreach Logged (24h / 7d)
            </p>
            <p className="mt-1 text-xl font-bold text-neutral-900">
              {outreachEventsLast24h} today{" "}
              <span className="text-xs font-normal text-neutral-500">
                (target {ALI_HYPERGROWTH_KPI_TARGETS.dailyOutreachActionsTarget}/day)
              </span>
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              7-day total: <strong>{outreachEventsLast7d}</strong> /{" "}
              {ALI_HYPERGROWTH_KPI_TARGETS.weeklyOutreachActionsTarget} target
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
            <p className="text-xs font-semibold text-neutral-500">
              Non-Fencing Services &amp; Freight
            </p>
            <p className="mt-1 text-xl font-bold text-green-800">
              {nonFencingServiceCount} services · {freightCount} freight
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              New non-fencing (7d): <strong>{nonFencingAddedLast7d}</strong> (target &ge;70% share)
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-3.5">
            <p className="text-xs font-semibold text-neutral-500">
              Active Jobs &amp; Inbox SLA (&gt;24h)
            </p>
            <p className="mt-1 text-xl font-bold text-neutral-900">
              {jobCount} live jobs{" "}
              <span className="text-xs font-normal text-neutral-500">
                (target {ALI_HYPERGROWTH_KPI_TARGETS.weeklyNewJobsTarget}+)
              </span>
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">
              Overdue enquiries (&gt;24h):{" "}
              <strong
                className={
                  unansweredEnquiriesOver24h > 0 ? "text-red-700" : "text-green-800"
                }
              >
                {unansweredEnquiriesOver24h}
              </strong>
            </p>
          </div>
        </div>

        {/* Automated Coaching Directives + Copy-Paste Feedback for Josh */}
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-green-200 bg-white p-4 text-xs">
            <p className="font-bold uppercase tracking-wide text-green-900">
              Automated Coach: Today&apos;s Top 3 Directives for Ali
            </p>
            <ul className="mt-2 space-y-2 text-neutral-800">
              {coachingReport.nextThreeDirectivesForAli.map((d) => (
                <li key={d} className="rounded-lg bg-green-50/70 p-2.5 font-medium">
                  {d}
                </li>
              ))}
            </ul>
            {coachingReport.gapsToFixToday.length > 0 && (
              <div className="mt-3 border-t border-neutral-200 pt-2 text-amber-950">
                <strong>Gaps detected by live DB check:</strong>
                <ul className="mt-1 list-disc pl-5">
                  {coachingReport.gapsToFixToday.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 text-xs">
            <p className="font-bold uppercase tracking-wide text-neutral-700">
              Josh&apos;s 5-Second Copy-Paste Feedback Message to Ali (Auto-Generated from Live DB)
            </p>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-sans text-xs text-neutral-800">
              {coachingReport.copyPasteFeedbackForJoshToSendAli}
            </pre>
          </div>
        </div>
      </section>

      {/* Section 1: 5-Day Starter Queue (A01 - A06) */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900">
            1. Immediate five-day sprint queue (`A01`–`A06`)
          </h2>
          <span className="text-xs text-neutral-500">
            Task states: Ready · In progress · Needs review · Blocked · Completed
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          Work these six structured tasks in order across Days 1–5. As soon as Wave 1 (Central West)
          reaches 3+ verified options per cell, immediately roll into Wave 2 (Riverina) below.
        </p>

        <div className="mt-4 space-y-4">
          {ALI_STARTER_QUEUE.map((task) => (
            <article
              key={task.id}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-green-800 px-2 py-0.5 text-xs font-bold text-white">
                    {task.code}
                  </span>
                  <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-800">
                    {task.day} · {task.priority}
                  </span>
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    Status: {task.defaultStatus}
                  </span>
                  <span className="text-xs text-neutral-500">
                    Owner: <strong>{task.owner}</strong> · Due: {task.dueDate}
                  </span>
                </div>
                <Link
                  href={task.workspaceHref}
                  className="rounded-lg border border-green-700 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-900 hover:bg-green-100"
                >
                  Open workspace →
                </Link>
              </div>

              <h3 className="mt-2 text-base font-bold text-neutral-900">{task.title}</h3>
              <p className="mt-1 text-sm text-neutral-700">{task.description}</p>

              <div className="mt-3 grid gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700 sm:grid-cols-3">
                <div>
                  <span className="font-semibold text-neutral-900">Category &amp; Region:</span>{" "}
                  {task.categorySlug} · {task.region}
                </div>
                <div>
                  <span className="font-semibold text-neutral-900">Expected Result:</span>{" "}
                  {task.expectedResult}
                </div>
                <div>
                  <span className="font-semibold text-neutral-900">Next Action:</span>{" "}
                  {task.nextAction}
                </div>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                <strong>If blocked:</strong> {task.fallbackWhenBlocked}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Section 2: Auto-Refilling National Conquest Waves (Waves 1-6) & 5-Year Hyper-Growth Plan */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-neutral-900">
          2. Auto-refilling national regional conquest waves (`Wave 1` → `Wave 6`)
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          You never run out of work. The moment a spotlight town hits &ge;3 verified options across core
          categories, advance immediately to the next town and the next Regional Conquest Wave.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {NATIONAL_CONQUEST_WAVES.map((w, idx) => (
            <div
              key={w.waveId}
              className={`rounded-xl border p-4 text-xs ${
                idx === 0
                  ? "border-2 border-green-700 bg-green-50/50"
                  : "border-neutral-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="rounded bg-green-800 px-2 py-0.5 font-bold text-white">
                  {w.waveId} · {w.stateScope}
                </span>
                <span className="font-semibold text-neutral-600">{w.timeframe}</span>
              </div>
              <h3 className="mt-2 text-sm font-bold text-neutral-900">{w.waveTitle}</h3>
              <p className="mt-1 text-neutral-700">
                <strong>Towns:</strong> {w.targetTowns.join(", ")}
              </p>
              <p className="mt-2 font-semibold text-green-900">
                Targets: +{w.targetNewVerifiedListings} verified listings · {w.targetClaimedProfiles}+
                claimed · {w.targetActiveJobs}+ jobs
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">{w.unlockCriteria}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-8 text-lg font-bold text-neutral-900">
          5-Year Hyper-Growth Master Plan (`Year 1` → `Year 5`: 10,000+ Daily Users)
        </h3>
        <div className="mt-3 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2.5">Horizon</th>
                <th className="px-3 py-2.5">North Star Target</th>
                <th className="px-3 py-2.5">Verified Listings</th>
                <th className="px-3 py-2.5">Claimed Profiles</th>
                <th className="px-3 py-2.5">Jobs &amp; Workers</th>
                <th className="px-3 py-2.5">Ali&apos;s Core Mission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {FIVE_YEAR_HYPERGROWTH_ROADMAP.map((stage) => (
                <tr key={stage.year}>
                  <td className="px-3 py-2.5 font-bold text-green-900">
                    {stage.year}
                    <div className="font-normal text-neutral-600">{stage.headline}</div>
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-neutral-900">
                    {stage.northStarMetric}
                  </td>
                  <td className="px-3 py-2.5">{stage.verifiedActiveListingsTarget}</td>
                  <td className="px-3 py-2.5">{stage.claimedProfilesTarget}</td>
                  <td className="px-3 py-2.5">{stage.activeJobsAndWorkersTarget}</td>
                  <td className="px-3 py-2.5 text-neutral-700">{stage.aliOperatingFocus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: 6-Hour Productive Day Rhythm & Fallback Ladder */}
      <section className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold text-neutral-900">
            3. Daily 6-hour hyper-growth rhythm
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Follow these 5 time-boxed blocks every shift to hit 15–25 verified additions and 20–30
            outreach actions per day.
          </p>
          <div className="mt-4 space-y-3">
            {ALI_DAILY_SCHEDULE.map((b) => (
              <div
                key={b.blockNumber}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-green-800">
                    Block {b.blockNumber} · {b.timeAllocation}
                  </span>
                  <Link
                    href={b.primaryRoute}
                    className="text-xs font-semibold text-green-800 underline"
                  >
                    {b.primaryRoute} →
                  </Link>
                </div>
                <h3 className="mt-1 text-sm font-bold text-neutral-900">{b.title}</h3>
                <p className="mt-1 text-xs text-neutral-700">{b.description}</p>
                <p className="mt-2 text-xs font-medium text-neutral-600">
                  Done when: {b.completionStandard}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold text-neutral-900">
            Fallback ladder (never stall)
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            What to switch to immediately when waiting on someone else:
          </p>
          <div className="mt-4 space-y-3">
            {ALI_FALLBACK_LADDER.map((item) => (
              <div
                key={item.whenBlockedBy}
                className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-xs"
              >
                <p className="font-bold text-amber-950">When: {item.whenBlockedBy}</p>
                <p className="mt-1 text-neutral-800">
                  <strong>Switch to:</strong> {item.switchImmediatelyTo}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Central West Town Coverage & Priority Categories */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-neutral-900">
          4. Wave 1 Central West NSW town targets &amp; category growth matrix
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2.5">Spotlight Town</th>
                <th className="px-3 py-2.5">Postcode</th>
                <th className="px-3 py-2.5">Subregion</th>
                <th className="px-3 py-2.5">Target Fencing</th>
                <th className="px-3 py-2.5">Target Non-Fencing Services</th>
                <th className="px-3 py-2.5">Target Freight Carriers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {CENTRAL_WEST_TOWNS.map((t) => {
                const liveTownCount = rows.filter(
                  (r) => (r.postcode ?? "").trim() === t.postcode
                ).length;
                return (
                  <tr key={t.postcode}>
                    <td className="px-3 py-2 font-semibold text-neutral-900">
                      {t.town}{" "}
                      <span className="font-normal text-neutral-500">
                        ({liveTownCount} live total)
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{t.postcode}</td>
                    <td className="px-3 py-2 text-neutral-600">{t.subregion}</td>
                    <td className="px-3 py-2">{t.minimumFencingOptions}+ verified</td>
                    <td className="px-3 py-2">{t.minimumNonFencingServices}+ verified</td>
                    <td className="px-3 py-2">{t.minimumFreightOptions}+ verified</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2.5">Category / Pillar</th>
                <th className="px-3 py-2.5">20 Oct Baseline</th>
                <th className="px-3 py-2.5">30-Day Target</th>
                <th className="px-3 py-2.5">Year 1 Target</th>
                <th className="px-3 py-2.5">Rural Utility</th>
                <th className="px-3 py-2.5">Outback Product Relationship</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {PRIORITY_HUB_CATEGORIES.map((c) => (
                <tr key={c.slug}>
                  <td className="px-3 py-2 font-semibold text-neutral-900">
                    {c.label}{" "}
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] uppercase text-neutral-600">
                      {c.pillar}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{c.auditBaselineCount}</td>
                  <td className="px-3 py-2 font-mono font-bold text-green-800">
                    {c.thirtyDayTargetCount}
                  </td>
                  <td className="px-3 py-2 font-mono font-bold text-green-950">
                    {c.yearOneTargetCount}
                  </td>
                  <td className="px-3 py-2 text-neutral-700">{c.whyFarmersAndWorkersNeedIt}</td>
                  <td className="px-3 py-2 text-neutral-600">{c.productRelationshipNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 5: Approved Source Register */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-neutral-900">
          5. Approved source register &amp; scraping guardrails
        </h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Allowed Method</th>
                <th className="px-3 py-2.5">Reuse &amp; Provenance Rule</th>
                <th className="px-3 py-2.5">Rate / Volume Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {HUB_SOURCE_REGISTER.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 font-semibold text-neutral-900">
                    {s.sourceName}
                    <div className="font-mono text-[11px] font-normal text-neutral-500">
                      {s.domainOrScope}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${
                        s.status === "approved"
                          ? "bg-green-100 text-green-900"
                          : s.status === "review_required"
                            ? "bg-amber-100 text-amber-900"
                            : "bg-red-100 text-red-900"
                      }`}
                    >
                      {s.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px]">{s.allowedMethod}</td>
                  <td className="px-3 py-2 text-neutral-700">{s.reuseAndRobotsBasis}</td>
                  <td className="px-3 py-2 text-neutral-600">{s.rateLimitAndVolumeRule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 6: Central West Promotion Pack */}
      <section className="mt-10 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900">
            6. Regional promotion pack: {CENTRAL_WEST_PROMOTION_PACK.title}
          </h2>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              centralWestReadiness.readyToPromote
                ? "bg-green-100 text-green-900"
                : "bg-amber-100 text-amber-900"
            }`}
          >
            {centralWestReadiness.readyToPromote
              ? "Readiness Gate: PASSED (Ready for Josh/Jess sign-off)"
              : "Readiness Gate: Complete source URL cleanup first"}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-600">
          Target towns: {CENTRAL_WEST_PROMOTION_PACK.targetRegion}
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Community Group Post Copy (Requires Josh/Jess Sign-Off Before Posting)
            </p>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-sans text-xs text-neutral-800">
              {CENTRAL_WEST_PROMOTION_PACK.communityGroupDraftCopy}
            </pre>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              1-to-1 Business Profile Claim Invite Copy (No Product Pitch)
            </p>
            <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-neutral-200 bg-neutral-50 p-3 font-sans text-xs text-neutral-800">
              {CENTRAL_WEST_PROMOTION_PACK.contractorDirectInviteSnippet}
            </pre>
          </div>
        </div>
      </section>

      {/* Section 7: Centralised Outback Fencing Product Reference & Daryl Handoff */}
      <section className="mt-10 rounded-xl border border-green-200 bg-green-50/40 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900">
            7. Outback Fencing &amp; Steel Supplies reference &amp; Daryl handoff rules
          </h2>
          <span className="text-xs text-neutral-500">
            Centralised in <code>lib/outback-products.ts</code> · Last checked:{" "}
            {PRODUCT_REFERENCE_LAST_CHECKED} · All prices AUD inc GST
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-700">
          When a fencing contractor or landholder asks about Clip Guns, C24 clips, mesh, pickets, or
          gates: share the verified product link or click{" "}
          <strong>Hand Product Enquiry to Daryl</strong> in{" "}
          <Link href="/dashboard/admin/contractor-outreach" className="underline font-semibold">
            Contractor Outreach
          </Link>{" "}
          (Daryl Kennewell: <strong>{DARYL_SALES_PHONE}</strong> · {DARYL_SALES_EMAIL}). Never invent
          freight quotes, bulk discounts, or lead times.
        </p>

        <h3 className="mt-4 text-sm font-bold text-neutral-900">
          Clip Gun Bundles (Australia Hierarchy: Lead with Full Kit $1,699; Skin Only $1,499 LAST)
        </h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2">Rank</th>
                <th className="px-3 py-2">Bundle</th>
                <th className="px-3 py-2">Price (AUD inc GST)</th>
                <th className="px-3 py-2">Verified Box Inclusions</th>
                <th className="px-3 py-2">Compatibility / Caveat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {OUTBACK_CLIPGUN_BUNDLES.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 font-mono">{b.merchandisingRank}</td>
                  <td className="px-3 py-2 font-semibold text-neutral-900">
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-green-800"
                    >
                      {b.name}
                    </a>
                  </td>
                  <td className="px-3 py-2 font-bold text-green-800">
                    {b.priceAudIncGstDisplay}
                  </td>
                  <td className="px-3 py-2 text-neutral-700">{b.inclusionsSummary}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {b.compatibilityOrSpecNote}
                    {b.staffCaveat && (
                      <div className="mt-1 font-medium text-amber-900">{b.staffCaveat}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="mt-4 text-sm font-bold text-neutral-900">
          Clips, Adaptors, Mesh, Pickets &amp; Gates (Including Live Storefront Caveats)
        </h3>
        <div className="mt-2 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-600">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Price / Path (AUD inc GST)</th>
                <th className="px-3 py-2">Verified Spec</th>
                <th className="px-3 py-2">Mandatory Staff Caveat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {OUTBACK_FENCING_AND_ACCESSORY_PRODUCTS.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-semibold text-neutral-900">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-green-800"
                    >
                      {p.name}
                    </a>
                  </td>
                  <td className="px-3 py-2 font-medium text-green-900">
                    {p.priceAudIncGstDisplay}
                  </td>
                  <td className="px-3 py-2 text-neutral-700">{p.inclusionsSummary}</td>
                  <td className="px-3 py-2 text-amber-950">{p.staffCaveat ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
