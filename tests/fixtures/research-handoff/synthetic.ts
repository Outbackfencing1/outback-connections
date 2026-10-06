// Synthetic research-handoff fixtures shared by the staging tests. No real
// business, domain or person: every identity is made up.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HANDOFF_CONTRACT, sha256Hex } from "@/lib/digital-services/research-handoff";

export const NOW = "2026-01-10T12:00:00+11:00";
export const REQUEST_ID = "synthetic-request-01";

export const exclusionsDoc = () => ({
  contract_id: "oc-research-exclusions/1",
  created_at: "2026-01-01T00:00:00+00:00",
  status: "dated_private_identity_snapshot_not_send_approval",
  identity_count: 3,
  identities: [
    identity("OC-901", "Alpha Test Cleaning", "alpha-test-cleaning.example", "cleaning", { cowork_reserved: true }),
    identity("OC-902", "Beta Test Detailing", "beta-test-detailing.example", "detailing"),
    {
      ...identity("OC-903", "Gamma Test Cleaners", "gamma-test.example", "cleaning", { research_held: true }),
      aliases: [
        { source: "outreach-engine", source_id: "OC-903", company_id: "OC-903" },
        { source: "primary-refresh-2026-01-02", source_id: "OC-777", company_id: "OC-903" },
      ],
    },
  ],
  cowork_reservations: [{ prospect_id: "OC-901", business: "Alpha Test Cleaning", segment: "cleaning", meaning: "reserved" }],
});
export function identity(id: string, business: string, domain: string, segment: string, flags: Record<string, boolean> = {}) {
  return {
    prospect_id: id,
    business,
    identity_name: business.toLowerCase(),
    aliases: [{ source: "outreach-engine", source_id: id, company_id: id }],
    observed_name_variants: [business],
    owned_domain: domain,
    location: "Testville NSW",
    segment,
    country: "AU",
    local_snapshot_state: "qa_hold",
    suppressed: false,
    paused: false,
    bounced: false,
    contacted: false,
    research_held: false,
    cowork_reserved: false,
    reserved_cleaner_lane: false,
    ...flags,
  };
}

export const exclusionsText = (doc: unknown = exclusionsDoc()) => `${JSON.stringify(doc, null, 2)}\r\n`;
export const EXCLUSIONS = exclusionsText();
export const EXCLUSIONS_SHA = sha256Hex(EXCLUSIONS);

export const requestDoc = (over: Record<string, unknown> = {}) => ({
  contract_id: HANDOFF_CONTRACT,
  request_id: REQUEST_ID,
  exclusions_sha256: EXCLUSIONS_SHA,
  geography: { country: "AU", towns: ["Testville", "Sampleton"] },
  segment: "cleaning",
  excluded_segments: ["auto detailing", "car washing", "ambiguous mixed cleaning/detailing"],
  existing_refreshes: [{ prospect_id: "OC-901", business: "Alpha Test Cleaning", primary_url: "https://alpha-test-cleaning.example/", provisional_offer_fit: "website_1990" }],
  authority: { live_sending: false, spending: false, publishing: false, form_submissions: false, production_changes: false, database_write_access: false },
  ...over,
});

export const schemaFile = resolve("tests/fixtures/research-handoff/schema.synthetic.json");
export function schemaFor(requestId = REQUEST_ID, sha = EXCLUSIONS_SHA) {
  const s = JSON.parse(readFileSync(schemaFile, "utf8"));
  s.properties.request_id.const = requestId;
  s.properties.exclusions_sha256.const = sha;
  return s;
}

export const ev = (url: string, over: Record<string, unknown> = {}) => ({
  source_url: url,
  checked_at: "2026-01-05T10:00:00+11:00",
  source_type: "primary_business_website",
  fact_text: "Synthetic fact.",
  exact_excerpts: ["synthetic excerpt"],
  limitations: ["Public-page reading only"],
  ...over,
});

export function candidate(n: number, over: Record<string, unknown> = {}) {
  const key = `candidate-${String(n).padStart(3, "0")}`;
  const domain = `synthetic-${n}-cleaning.example`;
  return {
    candidate_key: key,
    existing_prospect_id: null,
    business: `Synthetic ${n} Cleaning`,
    locality: "Testville NSW",
    state: "NSW",
    country: "AU",
    category: "commercial and office cleaning",
    owned_domain: domain,
    primary_url: `https://${domain}/`,
    contact_page_url: `https://${domain}/contact`,
    disposition: "qualified_research",
    duplicate_of: [],
    cleaner_verified: true,
    australia_verified: true,
    offer_fit: "existing_site_form_490",
    proposal: "Synthetic proposal.",
    evidence: [ev(`https://${domain}/`)],
    observed_journey: "Synthetic journey.",
    actual_checks: ["Fetched homepage"],
    contact_basis_status: "not_established",
    contact_restrictions: ["Contact basis not established"],
    uncertainties: ["Form delivery untested"],
    identity_confidence: "high",
    fit_confidence: "medium",
    sendable: false,
    ...over,
  };
}
export const hold = (n: number, over: Record<string, unknown> = {}) =>
  candidate(n, { disposition: "research_hold", cleaner_verified: false, offer_fit: "no_clear_fit", identity_confidence: "low", fit_confidence: "unknown", ...over });

export function refresh(over: Record<string, unknown> = {}) {
  return {
    prospect_id: "OC-901",
    business: "Alpha Test Cleaning",
    status: "refreshed",
    primary_url: "https://alpha-test-cleaning.example/",
    evidence: [ev("https://alpha-test-cleaning.example/quote")],
    observed_journey: "Synthetic.",
    proposed_offer_fit: "website_1990",
    proposal: "Synthetic.",
    actual_checks: ["Fetched quote page"],
    contact_basis_status: "not_established",
    limitations: ["Reservation unchanged"],
    sendable: false,
    ...over,
  };
}

export function output(candidates: unknown[], over: Record<string, unknown> = {}) {
  const count = (d: string) => candidates.filter((c) => (c as { disposition?: string }).disposition === d).length;
  return {
    contract_id: HANDOFF_CONTRACT,
    request_id: REQUEST_ID,
    exclusions_sha256: EXCLUSIONS_SHA,
    actual_model: "synthetic-model",
    started_at: "2026-01-05T09:00:00+11:00",
    finished_at: "2026-01-05T11:00:00+11:00",
    status: "completed",
    candidates,
    existing_refreshes: [refresh()],
    receipt: {
      fresh_qualified_count: count("qualified_research"),
      fresh_held_count: count("research_hold"),
      duplicate_count: count("duplicate_existing"),
      excluded_count: count("excluded"),
      fresh_candidates_inspected: candidates.length,
      primary_page_inspections: candidates.length,
      elapsed_seconds: 60,
      stop_reason: "synthetic",
      usage: null,
      usage_exposure: "not_exposed",
      outbound_sends: 0,
      form_submissions: 0,
      purchases: 0,
      paid_api_activations: 0,
      blocking_dependencies: [],
      coverage_limitations: [],
    },
    ...over,
  };
}

