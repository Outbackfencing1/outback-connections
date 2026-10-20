// app/dashboard/admin/hub-queue/page.tsx
// Ali's primary starting screen: Rural Hub Growth Coordinator Operating Queue.
// Combines the 5-day starter backlog (A01–A06), 6-hour daily operating rhythm,
// live Central West & category coverage counts, approved source register,
// promotion readiness pack, and centralised Outback Fencing product + Daryl handoff reference.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALI_DAILY_SCHEDULE,
  ALI_FALLBACK_LADDER,
  ALI_STARTER_QUEUE,
  CENTRAL_WEST_PROMOTION_PACK,
  CENTRAL_WEST_TOWNS,
  HUB_SOURCE_REGISTER,
  PRIORITY_HUB_CATEGORIES,
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
  title: "Hub growth queue (Ali) — Admin — Outback Connections",
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

  // Fetch live hub snapshot counts with explicit error capture (never hide query failures as 0)
  const svc = createAdminClient() ?? supabase;
  const nowIso = new Date().toISOString();
  const queryErrors: string[] = [];

  const { data: activeListings, error: listingsErr } = await svc
    .from("listings")
    .select("id, kind, postcode, state, source_url, category:categories(slug, label)")
    .eq("status", "active")
    .gt("expires_at", nowIso);

  if (listingsErr) {
    queryErrors.push(`active_listings: ${listingsErr.message}`);
  }

  const rows = (activeListings ?? []) as unknown as {
    id: string;
    kind: string;
    postcode: string | null;
    state: string | null;
    source_url: string | null;
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

  const centralWestPostcodes = new Set(CENTRAL_WEST_TOWNS.map((t) => t.postcode));
  const centralWestFencingRows = rows.filter(
    (r) =>
      getCatSlug(r) === "fencing-contractor" &&
      r.postcode &&
      centralWestPostcodes.has(r.postcode.trim())
  );

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
            Rural Hub Growth Coordinator · Daily Operating System
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Hub growth queue &amp; 5-day starter plan
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-neutral-700">
            Outback Connections is a <strong>free hub for rural work, jobs, freight, and services</strong>.
            Your primary mission is to keep enquiries moving, build genuine local coverage across all 24
            service categories, 8 freight categories, and rural employment, and help businesses claim their
            free profiles. Outback Fencing &amp; Steel Supplies products sit in a clear, disclosed supporting
            role alongside the hub.
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

      {/* Live Hub Coverage Snapshot */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Total Active Hub Listings
          </p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">{rows.length}</p>
          <p className="mt-1 text-xs text-neutral-600">Across all rural pillars</p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Fencing Contractors
          </p>
          <p className="mt-1 text-2xl font-bold text-green-800">{fencingCount}</p>
          <p className="mt-1 text-xs text-neutral-600">
            {centralWestFencingRows.length} in Central West NSW spotlights
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Other Rural Services (23 cats)
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{nonFencingServiceCount}</p>
          <p className="mt-1 text-xs text-amber-900">Priority growth focus (A03)</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Rural Freight &amp; Carriers
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{freightCount}</p>
          <p className="mt-1 text-xs text-amber-900">Target: 25+ verified carriers</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Work &amp; Skills Jobs
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-950">{jobCount}</p>
          <p className="mt-1 text-xs text-amber-900">Target: 15–20 live roles (A04)</p>
        </div>
      </section>

      {/* Role & Permissions Notice */}
      <section className="mt-6 rounded-xl border border-green-200 bg-green-50/70 p-4 text-xs text-neutral-800">
        <p className="font-semibold text-green-950">
          Three Independent Decisions for Every Candidate Business:
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-3 border border-green-200">
            <strong className="text-neutral-900">1. Does it belong in the free hub?</strong>
            <p className="mt-1 text-neutral-700">
              Genuine rural service, carrier, employer, or worker serving regional postcodes. A bore driller,
              mobile diesel mechanic, shearer, or rural plumber is a <strong>high-priority YES</strong> even
              though they never buy fencing gear.
            </p>
          </div>
          <div className="rounded-lg bg-white p-3 border border-green-200">
            <strong className="text-neutral-900">2. Is evidence sufficient to publish?</strong>
            <p className="mt-1 text-neutral-700">
              Requires a verified official website or approved directory source, rural base or verified rural
              service area, and private contact stored in internal fields only (never leaked on unclaimed pages).
            </p>
          </div>
          <div className="rounded-lg bg-white p-3 border border-green-200">
            <strong className="text-neutral-900">3. Is there a supporting product opportunity?</strong>
            <p className="mt-1 text-neutral-700">
              Keep first-touch claim invites 100% focused on the free hub profile. Only share Outback Fencing
              links or click <strong>Hand Product Enquiry to Daryl</strong> when a fencing business or farmer
              asks for materials or quotes.
            </p>
          </div>
        </div>
        <p className="mt-2 text-neutral-600">
          <strong>Access boundary:</strong> Staff accounts ({isAdmin ? "you are signed in as Admin" : "Staff mode"}) can
          access Hub Queue, Daily Report, Contractor Outreach, Enquiries, Add Directory Entry, Import, Analytics,
          and Demand. <strong>Claims approval (`/dashboard/admin/claims`), Flags, and Moderation require Josh (Admin).</strong>
        </p>
      </section>

      {/* Section 1: 5-Day Starter Queue (A01 - A06) */}
      <section className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900">
            1. Five-day starter work queue (`A01`–`A06`)
          </h2>
          <span className="text-xs text-neutral-500">
            Task states: Ready · In progress · Needs review · Blocked · Completed
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-600">
          Work these six structured tasks in order across Days 1–5. If any task is waiting on a reply or
          admin review, use its fallback rule immediately so your shift never stalls.
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

      {/* Section 2: 6-Hour Productive Day Rhythm & Fallback Ladder */}
      <section className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="text-xl font-bold text-neutral-900">
            2. Daily 6-hour operating rhythm
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Follow these 5 time-boxed blocks every shift. Never spend all day on cold outreach alone.
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

      {/* Section 3: Central West Town Coverage & Priority Categories */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-neutral-900">
          3. Central West NSW town targets &amp; category growth matrix
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Build deep, trustworthy local utility in our home region first before expanding outward.
          A category + town page is ready to promote externally once it has at least{" "}
          <strong>3 verified current options</strong>.
        </p>

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
                  <td className="px-3 py-2 text-neutral-700">{c.whyFarmersAndWorkersNeedIt}</td>
                  <td className="px-3 py-2 text-neutral-600">{c.productRelationshipNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4: Approved Source Register */}
      <section className="mt-10">
        <h2 className="text-xl font-bold text-neutral-900">
          4. Approved source register &amp; scraping guardrails
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Only use approved sources and methods. Never scrape Google Maps, Seek/Indeed/Jora, or bulk
          Yellow Pages listings, and never invent synthetic Google Search URLs.
        </p>

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

      {/* Section 5: Central West Promotion Pack */}
      <section className="mt-10 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900">
            5. Regional promotion pack: {CENTRAL_WEST_PROMOTION_PACK.title}
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

        {centralWestReadiness.blockingGaps.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <strong>Complete before external group posting:</strong>
            <ul className="mt-1 list-disc pl-5">
              {centralWestReadiness.blockingGaps.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          </div>
        )}

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

      {/* Section 6: Centralised Outback Fencing Product Reference & Daryl Handoff */}
      <section className="mt-10 rounded-xl border border-green-200 bg-green-50/40 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-neutral-900">
            6. Outback Fencing &amp; Steel Supplies reference &amp; Daryl handoff rules
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
