import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestTimestamp } from "@/lib/request-time";
import {
  ALI_DAILY_SCHEDULE,
  ALI_HYPERGROWTH_KPI_TARGETS,
  ALI_STARTER_QUEUE,
  NATIONAL_CONQUEST_WAVES,
  evaluateAliPerformanceAndFeedback,
} from "@/lib/hub-growth-queue";
import { signOut } from "./actions";

export const metadata = {
  title: "Dashboard — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/signin?next=/dashboard");

  const user = data.user;
  const createdAt = user.created_at ? new Date(user.created_at) : null;
  const now = await requestTimestamp();
  const ageMs = createdAt ? now - createdAt.getTime() : 0;
  const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  // Quick listings count (RLS lets owners read their own)
  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, is_staff, directory_contributor")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = !!profile?.is_admin;
  const isStaff = isAdmin || !!profile?.is_staff;
  const canAddDirectory = isStaff || !!profile?.directory_contributor;

  // Live telemetry for Ali & Josh right inside /dashboard
  let liveCoach: ReturnType<typeof evaluateAliPerformanceAndFeedback> | null = null;
  let listingsAdded24h = 0;
  let listingsAdded7d = 0;
  let outreach24h = 0;
  let outreach7d = 0;
  let activeJobsCount = 0;

  if (isStaff || canAddDirectory) {
    const svc = createAdminClient() ?? supabase;
    const nowDate = new Date(now);
    const nowIso = nowDate.toISOString();
    const iso24hAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const iso7dAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [listingsRes, outreachRes, enquiriesRes] = await Promise.all([
      svc
        .from("listings")
        .select("id, kind, created_at, category:categories(slug)")
        .eq("status", "active")
        .gt("expires_at", nowIso),
      svc
        .from("business_outreach_events")
        .select("id, created_at")
        .gte("created_at", iso7dAgo),
      svc
        .from("listing_enquiries")
        .select("id", { count: "exact", head: true })
        .eq("status", "new")
        .lte("created_at", iso24hAgo),
    ]);

    const rows = (listingsRes.data ?? []) as unknown as {
      id: string;
      kind: string;
      created_at: string | null;
      category: { slug: string } | { slug: string }[] | null;
    }[];
    const getCatSlug = (r: (typeof rows)[number]) => {
      if (!r.category) return null;
      return Array.isArray(r.category) ? r.category[0]?.slug ?? null : r.category.slug;
    };

    listingsAdded24h = rows.filter((r) => r.created_at && r.created_at >= iso24hAgo).length;
    const rows7d = rows.filter((r) => r.created_at && r.created_at >= iso7dAgo);
    listingsAdded7d = rows7d.length;
    const nonFencing7d = rows7d.filter((r) => getCatSlug(r) !== "fencing-contractor").length;
    const totalNonFencing = rows.filter(
      (r) => r.kind === "service_offering" && getCatSlug(r) !== "fencing-contractor"
    ).length;
    const totalFreight = rows.filter((r) => r.kind === "freight_offering").length;
    activeJobsCount = rows.filter((r) => r.kind === "job").length;

    const outreachRows = (outreachRes.data ?? []) as { id: string; created_at: string }[];
    outreach7d = outreachRows.length;
    outreach24h = outreachRows.filter((e) => e.created_at && e.created_at >= iso24hAgo).length;

    liveCoach = evaluateAliPerformanceAndFeedback({
      listingsAddedLast24h: listingsAdded24h,
      listingsAddedLast7d: listingsAdded7d,
      nonFencingAddedLast7d: nonFencing7d,
      outreachEventsLast24h: outreach24h,
      outreachEventsLast7d: outreach7d,
      activeJobsCount,
      unansweredEnquiriesOver24h: enquiriesRes.count ?? 0,
      pendingClaimsCount: 0,
      centralWestFencingCount: 0,
      totalNonFencingServiceCount: totalNonFencing,
      totalFreightCount: totalFreight,
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-neutral-700">
        Signed in as {user.email}{" "}
        {isAdmin ? (
          <span className="ml-2 rounded bg-green-800 px-2 py-0.5 text-xs font-semibold text-white">
            Admin
          </span>
        ) : isStaff ? (
          <span className="ml-2 rounded bg-green-700 px-2 py-0.5 text-xs font-semibold text-white">
            Staff · Rural Hub Growth Coordinator
          </span>
        ) : canAddDirectory ? (
          <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">
            Directory Contributor
          </span>
        ) : null}
      </p>

      {/* Ali's Embedded Live Velocity Score, Coaching Feedback & 5-Year Hyper-Growth Engine */}
      {(isStaff || canAddDirectory) && (
        <section className="mt-8 rounded-2xl border-2 border-green-700 bg-green-50/70 p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-green-900">
                Rural Hub Growth Coordinator (Ali) · 5-Year Hyper-Growth Operating Console
              </p>
              <h2 className="mt-1 text-xl font-bold text-neutral-900">
                Live velocity scoreboard, daily coach &amp; work queue
              </h2>
              <p className="mt-1 text-sm text-neutral-700">
                Daily Hyper-Growth Targets:{" "}
                <strong>
                  {ALI_HYPERGROWTH_KPI_TARGETS.dailyNewVerifiedListingsTarget}+ verified rural
                  listings added/day
                </strong>{" "}
                ·{" "}
                <strong>
                  {ALI_HYPERGROWTH_KPI_TARGETS.dailyOutreachActionsTarget}+ 1-to-1 claim invites
                  logged/day
                </strong>{" "}
                ·{" "}
                <strong>
                  {ALI_HYPERGROWTH_KPI_TARGETS.weeklyNewJobsTarget}+ active rural jobs live
                </strong>
                .
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <Link
                href="/dashboard/admin/hub-queue"
                className="rounded-lg bg-green-800 px-3.5 py-2 text-white hover:bg-green-900"
              >
                Open Full 5-Year Hub Queue &amp; Matrix →
              </Link>
              <Link
                href="/dashboard/admin/daily-report"
                className="rounded-lg border border-green-800 bg-white px-3 py-2 text-green-900 hover:bg-green-100"
              >
                Daily SLA Report →
              </Link>
              <Link
                href="/dashboard/directory/add"
                className="rounded-lg border border-green-800 bg-white px-3 py-2 text-green-900 hover:bg-green-100"
              >
                + Add Directory Entry →
              </Link>
            </div>
          </div>

          {/* Live Automated Scoreboard & Coach */}
          {liveCoach && (
            <div className="mt-4 rounded-xl border border-green-300 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-bold uppercase text-green-900">
                    Live Velocity Score: {liveCoach.velocityScoreOutOf100}/100
                  </span>
                  <p className="mt-1 text-sm font-bold text-neutral-900">
                    {liveCoach.headlineVerdict}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="rounded bg-neutral-100 px-2.5 py-1 font-semibold">
                    Added (24h/7d): {listingsAdded24h} / {listingsAdded7d} (target{" "}
                    {ALI_HYPERGROWTH_KPI_TARGETS.dailyNewVerifiedListingsTarget}/d ·{" "}
                    {ALI_HYPERGROWTH_KPI_TARGETS.weeklyNewVerifiedListingsTarget}/wk)
                  </span>
                  <span className="rounded bg-neutral-100 px-2.5 py-1 font-semibold">
                    Outreach (24h/7d): {outreach24h} / {outreach7d} (target{" "}
                    {ALI_HYPERGROWTH_KPI_TARGETS.dailyOutreachActionsTarget}/d ·{" "}
                    {ALI_HYPERGROWTH_KPI_TARGETS.weeklyOutreachActionsTarget}/wk)
                  </span>
                  <span className="rounded bg-neutral-100 px-2.5 py-1 font-semibold">
                    Live Jobs: {activeJobsCount} / {ALI_HYPERGROWTH_KPI_TARGETS.weeklyNewJobsTarget}+
                  </span>
                </div>
              </div>

              <div className="mt-3 border-t border-neutral-100 pt-3 text-xs">
                <p className="font-bold text-green-900">
                  Automated Daily Coaching Directives (What to execute right now):
                </p>
                <ul className="mt-1.5 space-y-1 text-neutral-800">
                  {liveCoach.nextThreeDirectivesForAli.map((d) => (
                    <li key={d}>• {d}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Daily 5-Block Checklist */}
          <div className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-700">
              Every Shift: 5-Step Daily Hyper-Growth Rhythm
            </h3>
            <div className="mt-2 grid gap-2.5 sm:grid-cols-5">
              {ALI_DAILY_SCHEDULE.map((block) => (
                <Link
                  key={block.blockNumber}
                  href={block.primaryRoute}
                  className="rounded-xl border border-green-200 bg-white p-3 text-xs transition hover:border-green-700 hover:shadow-sm"
                >
                  <p className="font-bold text-green-800">
                    Step {block.blockNumber} · {block.timeAllocation.split(" ")[0]}m
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900">{block.title}</p>
                  <p className="mt-1 text-[11px] text-neutral-600">{block.completionStandard}</p>
                </Link>
              ))}
            </div>
          </div>

          {/* 5-Day Starter Tasks A01 - A06 */}
          <div className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-700">
              Current Sprint Tasks (`A01`–`A06`) + Auto-Refilling Regional Waves (`Wave 1` → `Wave 6`)
            </h3>
            <div className="mt-2 space-y-2.5">
              {ALI_STARTER_QUEUE.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs"
                >
                  <div className="max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-green-800 px-2 py-0.5 font-bold text-white">
                        {task.code}
                      </span>
                      <span className="font-semibold text-neutral-600">
                        {task.day} · {task.priority}
                      </span>
                      <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                        {task.defaultStatus}
                      </span>
                      <span className="font-bold text-neutral-900">{task.title}</span>
                    </div>
                    <p className="mt-1 text-neutral-700">
                      <strong>Next action:</strong> {task.nextAction}
                    </p>
                    <p className="mt-0.5 text-[11px] text-neutral-500">
                      <strong>Goal:</strong> {task.expectedResult}
                    </p>
                  </div>
                  <Link
                    href={task.workspaceHref}
                    className="shrink-0 rounded-lg border border-green-700 bg-green-50 px-3 py-1.5 font-semibold text-green-900 hover:bg-green-100"
                  >
                    Start {task.code} →
                  </Link>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-green-200 bg-white p-3 text-xs text-neutral-700">
              <strong>Continuous 5-Year Pipeline:</strong> As soon as Wave 1 (Central West NSW) hits
              target density, your queue automatically advances through{" "}
              {NATIONAL_CONQUEST_WAVES.map((w) => w.waveId).join(" → ")} across NSW, VIC, QLD, SA, WA,
              TAS &amp; NT toward our Year 5 target of <strong>10,000+ daily active users</strong>.
            </div>
          </div>
        </section>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/dashboard/listings"
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Listings
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            My listings
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            View, edit, renew, or mark sold/matched.{" "}
            {count !== null && (
              <span className="text-neutral-500">
                ({count} total)
              </span>
            )}
          </p>
        </Link>

        <Link
          href="/dashboard/messages"
          className="rounded-2xl border border-green-300 bg-green-50/70 p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Inbox
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            Messages &amp; enquiries received
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Read quote requests, job enquiries, and buyer offers sent to your listings with 1-click call or email reply.
          </p>
        </Link>

        <Link
          href="/post/job?direction=available_for_work"
          className="rounded-2xl border border-green-300 bg-green-50/70 p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Work &amp; Skills Board
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            List your skills &amp; tickets
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            MC/HC truck licence, header/harvester, tractor + GPS, excavator, fencing, shearing or station work.
          </p>
        </Link>

        <Link
          href="/post/sale"
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Livestock, Harvest &amp; Gear
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            Sell or source stock, hay &amp; gear
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Cattle, sheep, lucerne &amp; cereal hay, grain, machinery or fencing steel. Zero commission.
          </p>
        </Link>

        <Link
          href="/post"
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Post Hub
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            Post a job, service or freight run
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Hiring workers, offering contracting services, or moving freight &amp; backloads. Free.
          </p>
        </Link>

        <Link
          href={`/profile/${user.id}`}
          className="rounded-2xl border border-green-300 bg-green-50/70 p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Reputation &amp; Reviews
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            My trust profile &amp; reviews
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            See how farmers, buyers, and contractors view your public profile, verification badges, and community vouches.
          </p>
        </Link>

        <Link
          href="/dashboard/settings"
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
            Settings &amp; Verification
          </p>
          <h2 className="mt-1 text-lg font-bold text-neutral-900">
            Edit ABN, badges &amp; bio
          </h2>
          <p className="mt-2 text-sm text-neutral-700">
            Add your ABN, trading/property name, insurances, and bio. Account age:{" "}
            {ageDays > 0
              ? `${ageDays} day${ageDays === 1 ? "" : "s"}`
              : `${ageHours} hour${ageHours === 1 ? "" : "s"}`}
            .
          </p>
        </Link>

        {canAddDirectory && (
          <Link
            href="/dashboard/directory/add"
            className="rounded-2xl border border-green-200 bg-green-50 p-5 shadow-sm transition hover:border-green-600 hover:shadow-md sm:col-span-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
              Directory
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900">Add a directory entry</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Found a business online that isn&apos;t yours? Add it here, not through
              &quot;Post a listing&quot;. It goes in as unclaimed, says where you found it,
              and the owner can claim it.
            </p>
          </Link>
        )}

        {isStaff && (
          <Link
            href="/dashboard/admin/demand"
            className="rounded-2xl border border-green-300 bg-green-50 p-5 shadow-sm transition hover:border-green-700 hover:shadow-md sm:col-span-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-green-900">
              Forecasting &amp; Market Intelligence
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900">
              Demand, crops, livestock &amp; work board intelligence
            </h2>
            <p className="mt-2 text-sm text-neutral-700">
              Regional &amp; monthly forecasting across crops/hay/livestock sold volume and prices,
              available workers vs jobs hiring, ticket pool, and service enquiries.
            </p>
          </Link>
        )}

        {isStaff && (
          <Link
            href="/dashboard/admin/contractor-outreach"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-400 hover:shadow-md sm:col-span-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Staff &amp; Outreach
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900">Contractor outreach &amp; Daryl handoff</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Directory claim invitations across all rural categories, task state tracking, and 1-click product handoff to Daryl.
            </p>
          </Link>
        )}

        {isStaff && (
          <Link
            href="/dashboard/admin/flags"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-400 hover:shadow-md sm:col-span-2"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              {isAdmin ? "Admin & Verification" : "Staff Verification Queue"}
            </p>
            <h2 className="mt-1 text-lg font-bold text-neutral-900">Verification &amp; flag queue</h2>
            <p className="mt-2 text-sm text-neutral-700">
              Approve new user listings in the Pending Verification Queue, review flags, claims (Admin), and analytics.
            </p>
          </Link>
        )}
      </div>

      <form action={signOut} className="mt-10">
        <button
          type="submit"
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </form>

      <p className="mt-6 text-xs text-neutral-500">
        <Link href="/" className="underline">
          ← Back to home
        </Link>
      </p>
    </div>
  );
}
