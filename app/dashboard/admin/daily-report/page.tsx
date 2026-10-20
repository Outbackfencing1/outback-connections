// /dashboard/admin/daily-report — Joshua's Daily Operator Report & Data-Quality Queue.
// Built on pure application rules (no paid AI calls):
// - Unanswered enquiries (>48h without forwarding) & failed email deliveries
// - Pending business claims
// - Stale owner availability (>45 days without confirmation)
// - Data-quality checks (duplicate phones/ABNs, postcode/state mismatches, expired insurance)
// - Honest outcome separation (enquirer-reported responses vs profile claims)
// - Explicit error/truncation banners ("Unable to read" never displays as "nothing to do")

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { relativeTime } from "@/lib/format";
import {
  buildDailyOperatorReport,
  formatDailyReportPlainText,
  type ContractorProfileSnapshot,
  type EnquirySnapshot,
  type PendingClaimSnapshot,
} from "@/lib/daily-report";

export const metadata = {
  title: "Daily Operator Report — Outback Connections",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ENQUIRIES_LIMIT = 300;
const CLAIMS_LIMIT = 100;
const PROFILES_PAGE_SIZE = 1000;

function getSixtyDaysAgoIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 60);
  return d.toISOString();
}

export default async function DailyOperatorReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const rawPage = Array.isArray(resolvedParams.page)
    ? resolvedParams.page[0]
    : resolvedParams.page;
  const page = Math.max(1, Number.parseInt(String(rawPage || "1"), 10) || 1);

  const supabase = createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect("/signin?next=/dashboard/admin/daily-report");

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("is_admin, is_staff")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!(profile?.is_admin || profile?.is_staff)) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Daily Operator Report</h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Staff and admins only</p>
        </div>
      </div>
    );
  }

  const db = createAdminClient() ?? supabase;
  const queryErrors: string[] = [];

  // 1. Recent enquiries (last 60 days)
  const sixtyDaysAgo = getSixtyDaysAgoIso();
  const enquiryRes = await db
    .from("listing_enquiries")
    .select(
      `id, anonymised_id, created_at, status, name, postcode, forwarded_at, forwarded_via,
       outcome, outcome_at,
       listing:listings(title, user_id, business:businesses(trading_name, claim_status, claimed_by))`
    )
    .gte("created_at", sixtyDaysAgo)
    .order("created_at", { ascending: false })
    .range((page - 1) * ENQUIRIES_LIMIT, page * ENQUIRIES_LIMIT - 1);

  if (enquiryRes.error) {
    queryErrors.push(`Enquiries read failed: ${enquiryRes.error.message}`);
  }

  const enquiries: EnquirySnapshot[] = (enquiryRes.data ?? []).map(
    (r: Record<string, unknown>) => {
      const listingRaw = r.listing as
        | {
            title?: string;
            user_id?: string | null;
            business?:
              | {
                  trading_name?: string | null;
                  claim_status?: string | null;
                  claimed_by?: string | null;
                }
              | {
                  trading_name?: string | null;
                  claim_status?: string | null;
                  claimed_by?: string | null;
                }[]
              | null;
          }
        | { title?: string; user_id?: string | null }[]
        | null;
      const listingObj = Array.isArray(listingRaw) ? listingRaw[0] : listingRaw;
      const bizRaw =
        listingObj && "business" in listingObj
          ? Array.isArray(listingObj.business)
            ? listingObj.business[0]
            : listingObj.business
          : null;
      const claimedListing = Boolean(
        listingObj?.user_id ||
          bizRaw?.claimed_by ||
          bizRaw?.claim_status === "claimed" ||
          bizRaw?.claim_status === "trusted"
      );

      return {
        id: String(r.id),
        anonymised_id: String(r.anonymised_id ?? r.id),
        listing_title: String(listingObj?.title ?? bizRaw?.trading_name ?? "Listing"),
        customer_name: String(r.name ?? "Enquirer"),
        postcode: (r.postcode as string | null) ?? null,
        status: String(r.status ?? "new"),
        forwarded_at: (r.forwarded_at as string | null) ?? null,
        forwarded_via: (r.forwarded_via as string | null) ?? null,
        outcome: (r.outcome as string | null) ?? null,
        outcome_at: (r.outcome_at as string | null) ?? null,
        created_at: String(r.created_at),
        claimed_listing: claimedListing,
      };
    }
  );

  // 2. Pending claims
  const claimRes = await db
    .from("business_claims")
    .select(
      `id, claimant_email, verification_method, created_at,
       business:businesses(trading_name, legal_name)`
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .range((page - 1) * CLAIMS_LIMIT, page * CLAIMS_LIMIT - 1);

  if (claimRes.error) {
    queryErrors.push(`Pending claims read failed: ${claimRes.error.message}`);
  }

  const pendingClaims: PendingClaimSnapshot[] = (claimRes.data ?? []).map(
    (c: Record<string, unknown>) => {
      const biz = Array.isArray(c.business) ? c.business[0] : c.business;
      const bizObj = biz as { trading_name?: string | null; legal_name?: string | null } | null;
      return {
        id: String(c.id),
        business_name: String(bizObj?.trading_name ?? bizObj?.legal_name ?? "Business"),
        claimant_email: String(c.claimant_email ?? ""),
        verification_method: String(c.verification_method ?? "admin_approval"),
        created_at: String(c.created_at),
      };
    }
  );

  // 3. Businesses / contractor profiles (paginated, with fallback if new migration columns aren't applied yet)
  const fromIdx = (page - 1) * PROFILES_PAGE_SIZE;
  const toIdx = page * PROFILES_PAGE_SIZE - 1;
  let bizRows: Record<string, unknown>[] = [];
  const fullBizQuery = await db
    .from("businesses")
    .select(
      `id, trading_name, legal_name, suburb, postcode, state_code, abn, contact_phone,
       claim_status, claimed_by, claimed_at, last_verified_at, availability_status,
       availability_updated_at, insurance_verified_at, insurance_expiry_date`
    )
    .eq("status", "active")
    .order("trading_name", { ascending: true })
    .range(fromIdx, toIdx);

  if (fullBizQuery.error) {
    const fallbackBizQuery = await db
      .from("businesses")
      .select(
        `id, trading_name, legal_name, suburb, postcode, state_code, abn, contact_phone,
         claim_status, claimed_by, claimed_at, last_verified_at, availability_status`
      )
      .eq("status", "active")
      .order("trading_name", { ascending: true })
      .range(fromIdx, toIdx);
    if (fallbackBizQuery.error) {
      queryErrors.push(`Businesses read failed: ${fallbackBizQuery.error.message}`);
    } else {
      bizRows = (fallbackBizQuery.data ?? []) as Record<string, unknown>[];
    }
  } else {
    bizRows = (fullBizQuery.data ?? []) as Record<string, unknown>[];
  }

  const profiles: ContractorProfileSnapshot[] = bizRows.map((b) => {
    const isOwnerConfirmed = Boolean(
      b.claimed_by || b.claim_status === "claimed" || b.claim_status === "trusted"
    );
    return {
      id: String(b.id),
      trading_name: String(b.trading_name ?? b.legal_name ?? "Business"),
      suburb: (b.suburb as string | null) ?? null,
      postcode: (b.postcode as string | null) ?? null,
      state: (b.state_code as string | null) ?? null,
      abn: (b.abn as string | null) ?? null,
      contact_phone: (b.contact_phone as string | null) ?? null,
      claim_status: isOwnerConfirmed ? "claimed" : String(b.claim_status ?? "unclaimed"),
      availability_status: (b.availability_status as string | null) ?? "available",
      availability_updated_at:
        (b.availability_updated_at as string | null) ??
        (b.claimed_at as string | null) ??
        (b.last_verified_at as string | null) ??
        null,
      insurance_verified_at: (b.insurance_verified_at as string | null) ?? null,
      insurance_expiry_date: (b.insurance_expiry_date as string | null) ?? null,
    };
  });

  const report = buildDailyOperatorReport({
    enquiries,
    pendingClaims,
    profiles,
    queryErrors,
    enquiriesLimit: ENQUIRIES_LIMIT,
    claimsLimit: CLAIMS_LIMIT,
    profilesLimit: PROFILES_PAGE_SIZE,
    page,
  });

  const plainTextDigest = formatDailyReportPlainText(report);
  const contractorPct = Math.min(
    100,
    Math.round(
      (report.localMilestone.orangeBathurstConfirmedContractors /
        report.localMilestone.targetContractors) *
        100
    )
  );
  const responsesPct = Math.min(
    100,
    Math.round(
      (report.localMilestone.reportedResponsesCount / report.localMilestone.targetMatches) * 100
    )
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-900">
            Pure Application Rules · Zero Paid AI Calls · Freshness: {report.generatedAt.slice(0, 19).replace("T", " ")} UTC
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-neutral-900">
            Daily Operator Report &amp; Data-Quality Queue
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            Highlights unanswered enquiries, pending claims, stale availability, data-quality issues, and Central West milestone progress.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/dashboard/admin/hub-queue"
            className="rounded-lg bg-green-800 px-3 py-2 font-semibold text-white hover:bg-green-950"
          >
            Ali&apos;s Rural Hub Queue →
          </Link>
          <Link
            href="/dashboard/admin/enquiries"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Open Enquiry Queue →
          </Link>
          <Link
            href="/dashboard/admin/claims"
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Open Claims Queue →
          </Link>
        </div>
      </div>

      {/* Explicit Error / Completeness Banner — "Unable to read" never displays as "nothing to do" */}
      {report.queryStatus.hasErrors && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950"
        >
          <p className="font-bold">
            ⚠ Data Read Incomplete — Do NOT treat empty sections below as &ldquo;nothing to do&rdquo;
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs">
            {report.queryStatus.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {report.queryStatus.truncated && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950">
          <span>
            <strong>Pagination / Completeness Notice:</strong> Page {page} reached the batch query cap (
            {report.queryStatus.enquiriesTruncated ? `${ENQUIRIES_LIMIT} enquiries ` : ""}
            {report.queryStatus.claimsTruncated ? `${CLAIMS_LIMIT} claims ` : ""}
            {report.queryStatus.profilesTruncated ? `${PROFILES_PAGE_SIZE} businesses` : ""}).
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/admin/daily-report?page=${page - 1}`}
                className="rounded border border-amber-400 bg-white px-2.5 py-1 font-semibold"
              >
                ← Page {page - 1}
              </Link>
            )}
            <Link
              href={`/dashboard/admin/daily-report?page=${page + 1}`}
              className="rounded bg-amber-900 px-2.5 py-1 font-semibold text-white"
            >
              Next Page ({page + 1}) →
            </Link>
          </div>
        </div>
      )}

      {/* Central West First Milestone Tracker */}
      <section className="mt-6 rounded-2xl border border-green-300 bg-gradient-to-br from-green-50/90 via-white to-amber-50/40 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-green-900">
              First Local Trust Milestone — Orange, Bathurst &amp; Central West NSW
            </p>
            <p className="mt-0.5 text-sm text-neutral-700">
              10 owner-confirmed providers around Orange/Bathurst + 5 enquirer-reported responses.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-green-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Owner-confirmed profiles (Central West)
              </span>
              <span className="text-xl font-bold text-green-900">
                {report.localMilestone.orangeBathurstConfirmedContractors} /{" "}
                {report.localMilestone.targetContractors}
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-green-700"
                style={{ width: `${contractorPct}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-green-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Enquirer reported response received (Not job completion)
              </span>
              <span className="text-xl font-bold text-green-900">
                {report.localMilestone.reportedResponsesCount} /{" "}
                {report.localMilestone.targetMatches}
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-emerald-600"
                style={{ width: `${responsesPct}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Top Action Cards */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Unanswered (&gt;48h)
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              report.unansweredEnquiries.length > 0 ? "text-amber-700" : "text-neutral-900"
            }`}
          >
            {enquiryRes.error ? "Unavailable" : report.unansweredEnquiries.length}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Failed email deliveries: {enquiryRes.error ? "—" : report.failedDeliveryEnquiries.length}
          </p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Pending Business Claims
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              report.pendingClaims.length > 0 ? "text-amber-700" : "text-neutral-900"
            }`}
          >
            {claimRes.error ? "Unavailable" : report.pendingClaims.length}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Awaiting admin verification</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Stale Availability (&gt;45d)
          </p>
          <p className="mt-1 text-2xl font-bold text-neutral-900">
            {report.staleAvailabilityProfiles.length}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Claimed profiles needing refresh</p>
        </div>

        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Data-Quality Queue
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              report.dataQualityQueue.length > 0 ? "text-amber-700" : "text-neutral-900"
            }`}
          >
            {report.dataQualityQueue.length}
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            Duplicates, state mismatches, expired docs
          </p>
        </div>
      </div>

      {/* 1. Unanswered Enquiries & Failed Deliveries */}
      <section className="mt-8 rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-900">
            1. Enquiry Tracking — Unanswered (&gt;48h), Failed Delivery &amp; No-Response Reports
          </h2>
          <Link
            href="/dashboard/admin/enquiries"
            className="text-xs font-semibold text-green-800 hover:underline"
          >
            Manage enquiries →
          </Link>
        </div>
        {enquiryRes.error ? (
          <p className="mt-3 text-sm font-medium text-red-800">
            Enquiry data could not be read ({enquiryRes.error.message}).
          </p>
        ) : report.unansweredEnquiries.length === 0 &&
          report.failedDeliveryEnquiries.length === 0 &&
          report.noResponseOutcomes.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            No unanswered (&gt;48h), failed-delivery, or no-response enquiries in the current page window.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            {report.unansweredEnquiries.map((e) => (
              <div
                key={`unans-${e.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2"
              >
                <div>
                  <span className="font-mono text-xs font-bold text-amber-900">
                    #{e.anonymised_id}
                  </span>{" "}
                  <span className="font-semibold text-neutral-900">{e.customer_name}</span> →{" "}
                  <span className="text-neutral-800">{e.listing_title}</span>
                  {e.postcode ? (
                    <span className="ml-1.5 text-xs text-neutral-500">({e.postcode})</span>
                  ) : null}
                </div>
                <span className="text-xs font-medium text-amber-900">
                  Unforwarded · {relativeTime(e.created_at)}
                </span>
              </div>
            ))}
            {report.noResponseOutcomes.map((e) => (
              <div
                key={`noresp-${e.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50/60 px-3 py-2"
              >
                <div>
                  <span className="font-mono text-xs font-bold text-red-900">
                    #{e.anonymised_id}
                  </span>{" "}
                  <span className="font-semibold text-neutral-900">{e.customer_name}</span> reported{" "}
                  <strong>no reply yet</strong> from{" "}
                  <span className="text-neutral-800">{e.listing_title}</span>
                </div>
                <span className="text-xs font-medium text-red-800">
                  Follow up or suggest another provider
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Enquirer-Reported Responses (Distinct from Job Completion) */}
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-bold text-neutral-900">
          2. Enquirer Reported Response Received ({report.reportedResponses.length})
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Enquiries where the enquirer clicked &ldquo;Yes, they got back to me&rdquo;. This records a reported reply, not proof that a contractor was hired or a job completed.
        </p>
        {report.reportedResponses.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">No enquirer-reported responses recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {report.reportedResponses.slice(0, 15).map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50/60 px-3 py-2"
              >
                <span>
                  <span className="font-mono text-xs font-semibold text-green-900">
                    #{m.anonymised_id}
                  </span>{" "}
                  <strong>{m.customer_name}</strong> reported a reply from{" "}
                  <strong>{m.listing_title}</strong>
                </span>
                <span className="text-xs text-green-800">
                  {m.outcome_at ? relativeTime(m.outcome_at) : relativeTime(m.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 3. Data-Quality Queue */}
      <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-bold text-neutral-900">
          3. Private Data-Quality Review Queue ({report.dataQualityQueue.length})
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Automatically flags duplicate phone numbers, duplicate ABNs, postcode/state contradictions,
          and expired insurance certificates.
        </p>
        {report.dataQualityQueue.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            No duplicate phones/ABNs, state mismatches, or expired insurance records detected in this page slice.
          </p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {report.dataQualityQueue.slice(0, 30).map((issue, idx) => (
              <li
                key={`${issue.kind}-${idx}`}
                className={`rounded-lg border px-3 py-2 ${
                  issue.severity === "high"
                    ? "border-amber-300 bg-amber-50/70 text-amber-950"
                    : "border-neutral-200 bg-neutral-50 text-neutral-800"
                }`}
              >
                <span className="mr-2 inline-block rounded bg-white px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-neutral-700">
                  {issue.kind.replace(/_/g, " ")}
                </span>
                {issue.summary}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. Plain-Text Copyable Daily Digest */}
      <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-700">
          Copyable Plain-Text Daily Digest (Email / SMS Ready)
        </h2>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-neutral-200 bg-white p-4 font-mono text-xs text-neutral-800">
          {plainTextDigest}
        </pre>
      </section>
    </div>
  );
}
