// lib/daily-report.ts — Pure, deterministic application rules (no paid AI calls)
// for enquiry tracking, availability staleness checks, data-quality queue items,
// and Joshua's Daily Operator Report.
//
// Audit rules enforced:
// 1. A farmer reporting `outcome === "responded"` proves a reported response,
//    NOT that a contractor was hired or a job completed.
// 2. Database read errors and truncation states are surfaced explicitly (`queryStatus`)
//    so "unable to read" never displays as "nothing to do".

import { AVAILABILITY_STALE_DAYS, normaliseAbn, normalisePhoneDigits } from "./trust";

export const UNANSWERED_ENQUIRY_HOURS = 48;

export const CENTRAL_WEST_TARGET_POSTCODES = new Set([
  "2800", // Orange
  "2795", // Bathurst
  "2866", // Molong
  "2798", // Millthorpe / Blayney
  "2799", // Blayney
  "2794", // Cowra
  "2870", // Parkes
  "2871", // Forbes
  "2820", // Wellington
  "2830", // Dubbo
  "2850", // Mudgee
  "2790", // Lithgow / Oberon
  "2787", // Oberon
]);

export type EnquirySnapshot = {
  id: string;
  anonymised_id: string;
  listing_title: string;
  customer_name: string;
  postcode: string | null;
  status: string; // 'new' | 'forwarded' | 'closed' | 'spam'
  forwarded_at?: string | null;
  forwarded_via?: string | null;
  outcome?: string | null; // 'responded' | 'no_response' | 'done_elsewhere'
  outcome_at?: string | null;
  created_at: string;
  claimed_listing?: boolean;
};

export type PendingClaimSnapshot = {
  id: string;
  business_name: string;
  claimant_email: string;
  verification_method: string;
  created_at: string;
};

export type ContractorProfileSnapshot = {
  id: string;
  trading_name: string;
  suburb?: string | null;
  postcode?: string | null;
  state?: string | null;
  abn?: string | null;
  contact_phone?: string | null;
  claim_status?: string | null;
  availability_status?: string | null;
  availability_updated_at?: string | null;
  insurance_verified_at?: string | null;
  insurance_expiry_date?: string | null;
};

export type DataQualityIssue = {
  kind:
    | "duplicate_phone"
    | "duplicate_abn"
    | "postcode_state_mismatch"
    | "expired_insurance";
  severity: "high" | "medium";
  recordIds: string[];
  summary: string;
};

export type ReportQueryStatus = {
  hasErrors: boolean;
  errors: string[];
  truncated: boolean;
  enquiriesTruncated: boolean;
  claimsTruncated: boolean;
  profilesTruncated: boolean;
  page: number;
};

export type DailyOperatorReport = {
  generatedAt: string;
  queryStatus: ReportQueryStatus;
  unansweredEnquiries: EnquirySnapshot[];
  failedDeliveryEnquiries: EnquirySnapshot[];
  noResponseOutcomes: EnquirySnapshot[];
  /** Enquirer reported receiving a response (distinct from job hired/completed). */
  reportedResponses: EnquirySnapshot[];
  /** Retained alias for backwards compatibility with existing callers. */
  confirmedMatches: EnquirySnapshot[];
  pendingClaims: PendingClaimSnapshot[];
  staleAvailabilityProfiles: ContractorProfileSnapshot[];
  dataQualityQueue: DataQualityIssue[];
  localMilestone: {
    orangeBathurstConfirmedContractors: number;
    targetContractors: number;
    /** Enquirer-reported responses (not proof of job completion). */
    reportedResponsesCount: number;
    confirmedHelpfulMatches: number;
    targetMatches: number;
  };
};

function expectedStateForPostcodePrefix(postcode: string): string | null {
  if (!/^\d{4}$/.test(postcode)) return null;
  const n = Number(postcode);
  if (n >= 1000 && n <= 2599) return "NSW";
  if (n >= 2619 && n <= 2899) return "NSW";
  if (n >= 2600 && n <= 2618) return "ACT";
  if (n >= 3000 && n <= 3999) return "VIC";
  if (n >= 4000 && n <= 4999) return "QLD";
  if (n >= 5000 && n <= 5799) return "SA";
  if (n >= 6000 && n <= 6797) return "WA";
  if (n >= 7000 && n <= 7799) return "TAS";
  if (n >= 800 && n <= 899) return "NT";
  return null;
}

const BORDER_POSTCODES = new Set([
  "2406", // Mungindi NSW/QLD
  "2640", // Albury/Wodonga
  "3644", // Cobram/Barooga
  "3585", // Swan Hill
  "3500", // Mildura
  "4380", // Stanthorpe/Wallangarra
  "4385", // Texas QLD/NSW
  "0872", // Alice Springs / tri-state remote
]);

/**
 * Runs deterministic data-quality checks across contractor/business profiles:
 * - Duplicate phone numbers across separate active records
 * - Duplicate ABNs across separate active records
 * - Conflicting postcode vs state
 * - Expired sighted insurance certificates
 */
export function runDataQualityChecks(
  profiles: ContractorProfileSnapshot[],
  now: Date = new Date()
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const byPhone = new Map<string, ContractorProfileSnapshot[]>();
  const byAbn = new Map<string, ContractorProfileSnapshot[]>();

  for (const p of profiles) {
    const phoneDigits = normalisePhoneDigits(p.contact_phone);
    if (phoneDigits.length >= 8) {
      const list = byPhone.get(phoneDigits) ?? [];
      list.push(p);
      byPhone.set(phoneDigits, list);
    }

    const cleanAbn = normaliseAbn(p.abn);
    if (cleanAbn) {
      const list = byAbn.get(cleanAbn) ?? [];
      list.push(p);
      byAbn.set(cleanAbn, list);
    }

    if (p.postcode && p.state && !BORDER_POSTCODES.has(p.postcode.trim())) {
      const expected = expectedStateForPostcodePrefix(p.postcode.trim());
      const actual = p.state.trim().toUpperCase();
      if (expected && actual && expected !== actual) {
        issues.push({
          kind: "postcode_state_mismatch",
          severity: "medium",
          recordIds: [p.id],
          summary: `${p.trading_name}: Postcode ${p.postcode} expects state ${expected}, but record has ${actual}.`,
        });
      }
    }

    if (p.insurance_verified_at && p.insurance_expiry_date) {
      const expMs = new Date(p.insurance_expiry_date).getTime();
      if (!Number.isNaN(expMs) && expMs < now.getTime()) {
        issues.push({
          kind: "expired_insurance",
          severity: "high",
          recordIds: [p.id],
          summary: `${p.trading_name}: Sighted insurance certificate expired on ${p.insurance_expiry_date}.`,
        });
      }
    }
  }

  for (const [phone, group] of byPhone.entries()) {
    if (group.length > 1) {
      issues.push({
        kind: "duplicate_phone",
        severity: "medium",
        recordIds: group.map((g) => g.id),
        summary: `Duplicate phone ${phone} shared across ${group.length} profiles: ${group
          .map((g) => g.trading_name)
          .join(", ")}.`,
      });
    }
  }

  for (const [abn, group] of byAbn.entries()) {
    if (group.length > 1) {
      issues.push({
        kind: "duplicate_abn",
        severity: "high",
        recordIds: group.map((g) => g.id),
        summary: `Duplicate ABN ${abn} shared across ${group.length} profiles: ${group
          .map((g) => g.trading_name)
          .join(", ")}.`,
      });
    }
  }

  return issues;
}

/**
 * Builds the Daily Operator Report from enquiries, pending claims, and contractor profiles.
 */
export function buildDailyOperatorReport(params: {
  enquiries: EnquirySnapshot[];
  pendingClaims: PendingClaimSnapshot[];
  profiles: ContractorProfileSnapshot[];
  queryErrors?: string[];
  enquiriesLimit?: number;
  claimsLimit?: number;
  profilesLimit?: number;
  page?: number;
  now?: Date;
}): DailyOperatorReport {
  const now = params.now ?? new Date();
  const cutoffUnansweredMs =
    now.getTime() - UNANSWERED_ENQUIRY_HOURS * 60 * 60 * 1000;
  const cutoffStaleAvailMs =
    now.getTime() - AVAILABILITY_STALE_DAYS * 24 * 60 * 60 * 1000;

  const unansweredEnquiries: EnquirySnapshot[] = [];
  const failedDeliveryEnquiries: EnquirySnapshot[] = [];
  const noResponseOutcomes: EnquirySnapshot[] = [];
  const reportedResponses: EnquirySnapshot[] = [];

  for (const enq of params.enquiries) {
    const createdMs = new Date(enq.created_at).getTime();
    if (enq.forwarded_via === "email_failed") {
      failedDeliveryEnquiries.push(enq);
    }
    if (enq.status === "new" && !Number.isNaN(createdMs) && createdMs <= cutoffUnansweredMs) {
      unansweredEnquiries.push(enq);
    }
    if (enq.outcome === "no_response") {
      noResponseOutcomes.push(enq);
    }
    if (enq.outcome === "responded") {
      reportedResponses.push(enq);
    }
  }

  const staleAvailabilityProfiles = params.profiles.filter((p) => {
    if (p.claim_status !== "claimed") return false;
    if (!p.availability_updated_at) return true;
    const updMs = new Date(p.availability_updated_at).getTime();
    return Number.isNaN(updMs) || updMs < cutoffStaleAvailMs;
  });

  const orangeBathurstConfirmedContractors = params.profiles.filter(
    (p) =>
      p.claim_status === "claimed" &&
      p.postcode &&
      CENTRAL_WEST_TARGET_POSTCODES.has(p.postcode.trim())
  ).length;

  const dataQualityQueue = runDataQualityChecks(params.profiles, now);

  const errors = (params.queryErrors ?? []).filter(Boolean);
  const enquiriesTruncated =
    !!params.enquiriesLimit && params.enquiries.length >= params.enquiriesLimit;
  const claimsTruncated =
    !!params.claimsLimit && params.pendingClaims.length >= params.claimsLimit;
  const profilesTruncated =
    !!params.profilesLimit && params.profiles.length >= params.profilesLimit;

  return {
    generatedAt: now.toISOString(),
    queryStatus: {
      hasErrors: errors.length > 0,
      errors,
      truncated: enquiriesTruncated || claimsTruncated || profilesTruncated,
      enquiriesTruncated,
      claimsTruncated,
      profilesTruncated,
      page: params.page ?? 1,
    },
    unansweredEnquiries,
    failedDeliveryEnquiries,
    noResponseOutcomes,
    reportedResponses,
    confirmedMatches: reportedResponses,
    pendingClaims: params.pendingClaims,
    staleAvailabilityProfiles,
    dataQualityQueue,
    localMilestone: {
      orangeBathurstConfirmedContractors,
      targetContractors: 10,
      reportedResponsesCount: reportedResponses.length,
      confirmedHelpfulMatches: reportedResponses.length,
      targetMatches: 5,
    },
  };
}

export function formatDailyReportPlainText(report: DailyOperatorReport): string {
  const lines: string[] = [
    `Outback Connections — Daily Operator Report (${report.generatedAt.slice(0, 10)})`,
    `====================================================================`,
  ];

  if (report.queryStatus.hasErrors) {
    lines.push(
      `⚠ DATA READ INCOMPLETE / ERROR (Do NOT treat missing rows as zero work):`,
      ...report.queryStatus.errors.map((e) => `   - ${e}`),
      ``
    );
  }
  if (report.queryStatus.truncated) {
    lines.push(
      `⚠ PAGINATION NOTICE: One or more queries reached its page limit (Page ${report.queryStatus.page}). Use ?page=${report.queryStatus.page + 1} to inspect remaining rows.`,
      ``
    );
  }

  lines.push(
    `1. Central West Pilot Milestone (Orange / Bathurst & District):`,
    `   • Owner-confirmed profiles:     ${report.localMilestone.orangeBathurstConfirmedContractors} / ${report.localMilestone.targetContractors}`,
    `   • Enquirer-reported responses:  ${report.localMilestone.reportedResponsesCount} / ${report.localMilestone.targetMatches} (reported reply, not job completion)`,
    ``,
    `2. Enquiry Tracking & Follow-Up:`,
    `   • Unforwarded enquiries (>48h): ${report.unansweredEnquiries.length}`,
    `   • Failed email deliveries:      ${report.failedDeliveryEnquiries.length}`,
    `   • Enquirer reported 'No reply': ${report.noResponseOutcomes.length}`,
    `   • Enquirer reported 'Responded': ${report.reportedResponses.length}`,
    ``,
    `3. Claims & Availability Refresh:`,
    `   • Pending business claims:      ${report.pendingClaims.length}`,
    `   • Stale availability (>45d):    ${report.staleAvailabilityProfiles.length}`,
    ``,
    `4. Data-Quality Review Queue:`,
    `   • Flagged items:                ${report.dataQualityQueue.length}`
  );

  if (report.unansweredEnquiries.length > 0) {
    lines.push(``, `Urgent Unforwarded Enquiries (>48h):`);
    for (const e of report.unansweredEnquiries.slice(0, 10)) {
      lines.push(
        `   - [${e.anonymised_id}] ${e.customer_name} (${e.postcode ?? "no postcode"}) -> ${e.listing_title}`
      );
    }
  }

  if (report.dataQualityQueue.length > 0) {
    lines.push(``, `Data-Quality Queue Items:`);
    for (const item of report.dataQualityQueue.slice(0, 10)) {
      lines.push(`   - [${item.severity.toUpperCase()}] ${item.summary}`);
    }
  }

  return lines.join("\n");
}
