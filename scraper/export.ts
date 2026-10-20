// scraper/export.ts
// Generates staged exports:
// 1. rural_fencers_seed.json (including privacy_safe_import_records compatible with /dashboard/admin/import)
// 2. rural_fencers_seed.csv (internal review/outreach export)
// 3. rural_fencers_review.csv
// 4. rural_fencers_audit.json

import { buildDirectoryRecord, type DirectoryImportRecord } from "../lib/directory-records.ts";
import type {
  ExistingListingReviewItem,
  PipelineAuditReport,
  PipelineCandidate,
} from "./types.ts";

/** RFC-4180 CSV cell escaping, always quoting strings that contain commas, quotes, newlines, or leading zeroes. */
export function csvEscape(value: string | number | boolean | null | undefined, forceQuote = false): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (!str) return "";
  const hasLeadingZeroDigits = /^0\d+$/.test(str);
  if (
    forceQuote ||
    hasLeadingZeroDigits ||
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r") ||
    str.includes(";")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Parse a single CSV line produced by csvEscape (used in tests to verify round-trip fidelity). */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  cells.push(current);
  return cells;
}

/**
 * Converts accepted candidates into privacy-safe `DirectoryImportRecord[]` compatible
 * with `/dashboard/admin/import` (`import_directory_listings`), ensuring discovered
 * phone numbers and emails are stored ONLY in `raw_payload` and NEVER in public
 * listing columns (`description`, `title`, or top-level fields).
 */
export function buildPrivacySafeImportPayload(
  candidates: PipelineCandidate[],
  enteredAt: string = new Date().toISOString()
): DirectoryImportRecord[] {
  const accepted = candidates.filter(
    (c) =>
      c.record_disposition === "seed_new" ||
      c.record_disposition === "seed_existing_match"
  );

  const records: DirectoryImportRecord[] = [];
  for (const c of accepted) {
    if (!c.base_postcode) continue;
    const primarySourceUrl = c.website_url ?? c.sources[0]?.source_url ?? "";
    const platform = c.website_url ? "official_website" : "web";
    const built = buildDirectoryRecord(
      {
        name: c.business_name,
        vertical: "service",
        category_slug: "fencing-contractor",
        postcode: c.base_postcode,
        suburb: c.base_locality ?? undefined,
        state: c.base_state ?? undefined,
        platform,
        source_url: primarySourceUrl,
        phone: c.primary_phone_raw ?? undefined,
        email: c.public_email ?? undefined,
        notes: c.unclaimed_description ?? undefined,
      },
      {
        enteredBy: "scraper-pilot-staged",
        enteredVia: "scraper_pilot",
        enteredAt,
      }
    );
    if (built.ok) {
      records.push(built.record);
    }
  }
  return records;
}

export function buildSeedJsonPayload(
  candidates: PipelineCandidate[],
  generatedAt: string = new Date().toISOString()
) {
  const accepted = candidates.filter(
    (c) =>
      c.record_disposition === "seed_new" ||
      c.record_disposition === "seed_existing_match"
  );
  const newCandidates = accepted.filter((c) => c.record_disposition === "seed_new");
  const existingMatches = accepted.filter(
    (c) => c.record_disposition === "seed_existing_match"
  );
  const privacySafeImportRecords = buildPrivacySafeImportPayload(candidates, generatedAt);

  return {
    generated_at: generatedAt,
    category_id: "bb33b79d-d274-4e55-9eb6-f16badb5ec1a",
    category_slug: "fencing-contractor",
    privacy_notice:
      "Discovered phone numbers and email addresses in candidate objects are for internal verification and outreach only. When importing unclaimed listings via import_directory_listings, use privacy_safe_import_records so contacts remain strictly inside raw_payload until the owner claims the profile.",
    summary: {
      total_accepted: accepted.length,
      new_candidates_count: newCandidates.length,
      existing_listing_matches_count: existingMatches.length,
      privacy_safe_import_records_count: privacySafeImportRecords.length,
    },
    privacy_safe_import_records: privacySafeImportRecords,
    new_candidates: newCandidates,
    existing_listing_matches: existingMatches,
    all_accepted_candidates: accepted,
  };
}

export const SEED_CSV_HEADERS = [
  "candidate_id",
  "record_disposition",
  "matched_existing_listing_id",
  "matched_existing_business_id",
  "business_name",
  "published_aliases",
  "contact_name",
  "contact_names",
  "primary_phone_raw",
  "primary_phone_normalised",
  "all_phones_normalised",
  "public_email",
  "website_url",
  "social_links",
  "base_locality",
  "base_state",
  "base_postcode",
  "base_location_established",
  "published_service_areas",
  "supported_rural_specialties",
  "published_abn",
  "abn_status",
  "source_names",
  "source_urls",
  "retrieved_at",
  "unclaimed_description",
] as const;

export function buildSeedCsv(candidates: PipelineCandidate[]): string {
  const accepted = candidates.filter(
    (c) =>
      c.record_disposition === "seed_new" ||
      c.record_disposition === "seed_existing_match"
  );

  const lines: string[] = [SEED_CSV_HEADERS.join(",")];

  for (const c of accepted) {
    const row = [
      csvEscape(c.candidate_id),
      csvEscape(c.record_disposition),
      csvEscape(c.matched_existing_listing_id),
      csvEscape(c.matched_existing_business_id),
      csvEscape(c.business_name),
      csvEscape(c.published_aliases.join("; ")),
      csvEscape(c.contact_name),
      csvEscape(c.contact_names.join("; ")),
      csvEscape(c.primary_phone_raw, true),
      csvEscape(c.primary_phone_normalised, true),
      csvEscape(c.phones.map((p) => p.normalised_e164).join("; "), true),
      csvEscape(c.public_email),
      csvEscape(c.website_url),
      csvEscape(c.social_links.join("; ")),
      csvEscape(c.base_locality),
      csvEscape(c.base_state),
      csvEscape(c.base_postcode, true),
      csvEscape(c.base_location_established),
      csvEscape(c.published_service_areas.join("; ")),
      csvEscape(c.supported_rural_specialties.join("; ")),
      csvEscape(c.published_abn, true),
      csvEscape(c.abn_check.status),
      csvEscape(c.sources.map((s) => s.source_name).join("; ")),
      csvEscape(c.sources.map((s) => s.source_url).join("; ")),
      csvEscape(c.sources[0]?.retrieved_at ?? ""),
      csvEscape(c.unclaimed_description),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n") + "\n";
}

export const REVIEW_CSV_HEADERS = [
  "record_type",
  "id_or_candidate_id",
  "matched_existing_listing_id",
  "business_name",
  "contact_name",
  "phones_raw",
  "phones_normalised",
  "public_email",
  "website_url",
  "base_locality",
  "base_state",
  "base_postcode",
  "published_service_areas",
  "review_category",
  "reasons",
  "unresolved_questions",
  "source_urls",
  "supporting_evidence",
] as const;

export function buildReviewCsv(
  candidates: PipelineCandidate[],
  existingListingReviews: ExistingListingReviewItem[]
): string {
  const reviewCandidates = candidates.filter((c) => c.record_disposition === "review");
  const lines: string[] = [REVIEW_CSV_HEADERS.join(",")];

  for (const c of reviewCandidates) {
    const row = [
      csvEscape("pilot_candidate_review"),
      csvEscape(c.candidate_id),
      csvEscape(c.matched_existing_listing_id),
      csvEscape(c.business_name),
      csvEscape(c.contact_name),
      csvEscape(c.phones.map((p) => p.raw).join("; "), true),
      csvEscape(c.phones.map((p) => p.normalised_e164).join("; "), true),
      csvEscape(c.public_email),
      csvEscape(c.website_url),
      csvEscape(c.base_locality),
      csvEscape(c.base_state),
      csvEscape(c.base_postcode, true),
      csvEscape(c.published_service_areas.join("; ")),
      csvEscape(
        c.dedupe_notes.length > 0
          ? "cross_or_intra_source_conflict"
          : c.locality_validation_status === "missing_location" ||
              c.locality_validation_status === "ambiguous_locality" ||
              c.locality_validation_status === "state_postcode_contradiction"
            ? c.locality_validation_status
            : "insufficient_or_ambiguous_fencing_evidence"
      ),
      csvEscape([...c.disposition_reasons, ...c.dedupe_notes].join(" | ")),
      csvEscape(c.classification.unresolved_questions.join(" | ")),
      csvEscape(c.sources.map((s) => s.source_url).join("; ")),
      csvEscape(c.evidence_references.map((e) => e.excerpt).join(" | ")),
    ];
    lines.push(row.join(","));
  }

  for (const item of existingListingReviews) {
    const row = [
      csvEscape("existing_db_listing_correction"),
      csvEscape(item.listing_id),
      csvEscape(item.listing_id),
      csvEscape(item.title),
      csvEscape(""),
      csvEscape(""),
      csvEscape(""),
      csvEscape(""),
      csvEscape(""),
      csvEscape(""),
      csvEscape(item.state),
      csvEscape(item.postcode, true),
      csvEscape(""),
      csvEscape(item.issue_type),
      csvEscape(item.recommended_action),
      csvEscape(""),
      csvEscape(item.source_url ?? ""),
      csvEscape(item.evidence),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n") + "\n";
}

export function buildAuditJsonString(audit: PipelineAuditReport): string {
  return JSON.stringify(audit, null, 2) + "\n";
}
