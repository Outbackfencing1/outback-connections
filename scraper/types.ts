// scraper/types.ts
// Core data structures for the Outback Connections Rural Fencing Contractor Pipeline.

export type AustralianState = "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "NT" | "ACT";

export type PhoneType = "mobile" | "landline" | "tollfree_or_1300" | "unknown";

export interface PhoneRecord {
  raw: string;
  normalised_e164: string;
  national_digits: string;
  type: PhoneType;
  contact_name: string | null;
  source_url: string;
}

export interface EvidenceReference {
  source_name: string;
  source_url: string;
  retrieved_at: string;
  excerpt: string;
  supports: "rural_relevance" | "specialty" | "location" | "contact" | "identity";
}

export interface SourceSightingMetadata {
  source_id: string;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  reuse_Basis: string;
}

export interface RawCandidateSighting {
  sighting_id: string;
  source_id: string;
  source_name: string;
  source_url: string;
  retrieved_at: string;
  business_name: string;
  published_aliases: string[];
  contact_names: string[];
  phones: PhoneRecord[];
  public_email: string | null;
  had_protected_email_placeholder: boolean;
  website_url: string | null;
  social_links: string[];
  /** Base locality/town ONLY if explicitly published as a town/address on the source. */
  raw_base_locality: string | null;
  raw_base_state: string | null;
  raw_base_postcode: string | null;
  base_location_established: boolean;
  /** Published service regions/areas (distinct from base town). */
  published_service_areas: string[];
  /** Explicit fencing services stated on the source or official website. */
  explicit_fencing_services: string[];
  published_abn: string | null;
  evidence_references: EvidenceReference[];
  website_check_notes: string[];
  website_broken_or_parked: boolean;
}

export type ClassificationDecision = "include" | "review" | "exclude";

export interface ClassificationResult {
  decision: ClassificationDecision;
  reason: string;
  supported_rural_specialties: string[];
  evidence_references: {
    source_url: string;
    excerpt: string;
  }[];
  unresolved_questions: string[];
  classifier_mode: "gemini" | "deterministic";
}

export type AbnVerificationStatus =
  | "unchecked_no_abn"
  | "unchecked_no_guid"
  | "invalid_checksum"
  | "no_confident_match"
  | "api_error"
  | "confirmed_active"
  | "confirmed_cancelled";

export interface AbnCheckResult {
  status: AbnVerificationStatus;
  abn_raw: string | null;
  abn_normalised: string | null;
  checksum_valid: boolean | null;
  entity_name: string | null;
  entity_status: string | null;
  entity_state: string | null;
  entity_postcode: string | null;
  checked_at: string | null;
  notes: string;
}

export type ExistingProtectionStatus =
  | "none"
  | "matched_unclaimed_scraped"
  | "protected_claimed_profile"
  | "protected_owner_edited"
  | "protected_suppressed_or_removed";

export type RecordDisposition =
  | "seed_new"
  | "seed_existing_match"
  | "review"
  | "exclude";

export interface PipelineCandidate {
  candidate_id: string;
  category_id: string;
  category_slug: string;
  category_label: string;
  business_name: string;
  published_aliases: string[];
  contact_name: string | null;
  contact_names: string[];
  primary_phone_raw: string | null;
  primary_phone_normalised: string | null;
  phones: PhoneRecord[];
  public_email: string | null;
  website_url: string | null;
  social_links: string[];
  base_locality: string | null;
  base_state: AustralianState | null;
  /** Always a 4-character string when present (preserving leading zeroes like "0800"). */
  base_postcode: string | null;
  base_location_established: boolean;
  locality_validation_status:
    | "valid_confirmed"
    | "service_area_only_no_base_town"
    | "missing_location"
    | "ambiguous_locality"
    | "state_postcode_contradiction";
  locality_validation_notes: string | null;
  published_service_areas: string[];
  explicit_fencing_services: string[];
  supported_rural_specialties: string[];
  published_abn: string | null;
  abn_check: AbnCheckResult;
  classification: ClassificationResult;
  record_disposition: RecordDisposition;
  disposition_reasons: string[];
  matched_existing_listing_id: string | null;
  matched_existing_business_id: string | null;
  matched_existing_status: string | null;
  existing_protection_status: ExistingProtectionStatus;
  dedupe_notes: string[];
  unclaimed_description: string | null;
  sources: {
    source_id: string;
    source_name: string;
    source_url: string;
    retrieved_at: string;
  }[];
  evidence_references: EvidenceReference[];
}

export interface ExistingListingReviewItem {
  listing_id: string;
  business_id: string | null;
  title: string;
  status: string;
  postcode: string;
  state: string;
  source_platform: string | null;
  source_url: string | null;
  issue_type:
    | "yellow_pages_provenance_rewritten_to_search_url"
    | "duplicate_active_listing"
    | "state_postcode_contradiction"
    | "non_rural_or_unrelated_business_in_fencing"
    | "materials_supplier_in_fencing_installer_category"
    | "pilot_source_enrichment_or_conflict";
  recommended_action: string;
  evidence: string;
}

export interface SourceAuditEntry {
  source_id: string;
  source_name: string;
  source_url: string;
  status: "succeeded" | "failed" | "skipped_policy" | "skipped_disabled";
  robots_txt_checked: boolean;
  robots_txt_allowed: boolean;
  reuse_conditions_summary: string;
  raw_records_extracted: number;
  error_message: string | null;
}

export interface PipelineAuditReport {
  generated_at: string;
  category: {
    id: string;
    slug: string;
    label: string;
    pillar: string;
  };
  environment_and_credentials: {
    supabase_read_access: "available_anon" | "available_service_role" | "unavailable";
    rls_hidden_tables_note: string;
    gemini_api_key_present: boolean;
    gemini_model_configured: string;
    abn_lookup_guid_present: boolean;
  };
  existing_database_fencing_counts: {
    total_visible_fencing_rows: number;
    active_unclaimed_scraped: number;
    closed_legacy_manual: number;
    metro_archived_in_migrations_note: number;
    reclassified_non_fencing_in_migrations_note: number;
    public_homepage_total_active_all_pillars: number;
    public_homepage_fencing_finder_count: number;
    public_fencing_category_page_count: number;
    by_source_platform: Record<string, number>;
    yellow_pages_provenance_findings: {
      synthetic_google_search_url_count: number;
      summary: string;
    };
  };
  sources_checked: SourceAuditEntry[];
  website_enrichment_summary: {
    websites_checked: number;
    websites_succeeded: number;
    websites_broken_or_parked: {
      business_name: string;
      website_url: string;
      finding: string;
    }[];
  };
  reconciliation: {
    raw_sightings_discovered: number;
    cross_or_intra_source_duplicates_merged_or_flagged: number;
    unique_candidates_evaluated: number;
    accepted_seed_total: number;
    accepted_seed_new: number;
    accepted_seed_existing_matches: number;
    routed_to_review: number;
    excluded: number;
    protected_claimed_or_suppressed_skipped: number;
  };
  existing_listing_review_summary: {
    total_flagged_for_review: number;
    by_issue_type: Record<string, number>;
  };
}
