// scraper/run-pilot.ts
// CLI runner for the Outback Connections Rural Fencing Contractor Pilot Pipeline.
// Usage:
//   npx tsx scraper/run-pilot.ts
//   node --experimental-strip-types scraper/run-pilot.ts
// Note: Defaults to deterministic/offline classification (zero paid Gemini calls)
// unless --allow-paid-ai is explicitly passed.

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { FENCING_CONTRACTOR_CATEGORY, PILOT_SOURCES, PIPELINE_SETTINGS } from "./config.ts";
import { fetchWithRetry, isPathAllowedByRobotsTxt } from "./sources/http.ts";
import { parseWestonfenceHtml } from "./sources/westonfence.ts";
import { parseRotechRuralHtml } from "./sources/rotech-rural.ts";
import { enrichSightingFromWebsiteHtml } from "./sources/website-enricher.ts";
import {
  auditExistingFencingListings,
  consolidateAndEvaluateCandidates,
  type ExistingDatabaseListing,
} from "./dedupe-and-match.ts";
import {
  buildAuditJsonString,
  buildReviewCsv,
  buildSeedCsv,
  buildSeedJsonPayload,
} from "./export.ts";
import { normaliseBusinessNameKey } from "./normalise.ts";
import type {
  PipelineAuditReport,
  RawCandidateSighting,
  SourceAuditEntry,
} from "./types.ts";

function loadEnvLocal(repoRoot: string) {
  const envPath = path.join(repoRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const idx = trimmed.indexOf("=");
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

async function fetchLiveDatabaseListings(repoRoot: string): Promise<{
  accessMode: "available_anon" | "available_service_role" | "unavailable";
  fencingListings: ExistingDatabaseListing[];
  allListings: ExistingDatabaseListing[];
  allActiveCount: number;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;

  if (!url || !key) {
    return {
      accessMode: "unavailable",
      fencingListings: [],
      allListings: [],
      allActiveCount: 0,
    };
  }

  const sb = createClient(url, key);
  const allListings: ExistingDatabaseListing[] = [];
  let from = 0;
  const step = 1000;

  while (true) {
    const { data, error } = await sb
      .from("listings")
      .select(
        "id, slug, kind, title, description, postcode, state, status, expires_at, user_id, category_id, data_source, source_platform, source_url, business_id, metadata, flag_count, under_review, business:businesses(id, claim_status, website_url, suburb, abn, outback_verified)"
      )
      .range(from, from + step - 1);

    if (error) {
      throw new Error(`Supabase listings query failed: ${error.message}`);
    }
    if (!data || data.length === 0) break;
    allListings.push(...(data as unknown as ExistingDatabaseListing[]));
    if (data.length < step) break;
    from += step;
  }

  const fencingListings = allListings.filter(
    (l) => (l as unknown as { category_id?: string }).category_id === FENCING_CONTRACTOR_CATEGORY.id
  );

  const nowIso = new Date().toISOString();
  const { count: allActiveCount } = await sb
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gt("expires_at", nowIso);

  return {
    accessMode: serviceKey ? "available_service_role" : "available_anon",
    fencingListings,
    allListings,
    allActiveCount: allActiveCount ?? 0,
  };
}

export async function runPilotPipeline(options?: {
  repoRoot?: string;
  writeToRootAndOutDir?: boolean;
  allowPaidAi?: boolean;
}) {
  const repoRoot = options?.repoRoot ?? process.cwd();
  loadEnvLocal(repoRoot);

  const allowPaidAi =
    options?.allowPaidAi ?? process.argv.includes("--allow-paid-ai");

  const outDir = path.join(repoRoot, "scraper", "out");
  const cacheDir = path.join(repoRoot, "scraper", "cache");
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const nowIso = new Date().toISOString();

  // 1. Read-only inspection of live Supabase database
  const dbState = await fetchLiveDatabaseListings(repoRoot);
  const activeFencing = dbState.fencingListings.filter((l) => l.status === "active");
  const closedFencing = dbState.fencingListings.filter((l) => l.status === "closed");

  const bySourcePlatform: Record<string, number> = {};
  for (const l of dbState.fencingListings) {
    const k = l.source_platform ?? "null";
    bySourcePlatform[k] = (bySourcePlatform[k] ?? 0) + 1;
  }

  // 2. Fetch & parse permitted pilot sources (recording skipped policy sources too)
  const sourcesChecked: SourceAuditEntry[] = [];
  const rawSightings: RawCandidateSighting[] = [];

  for (const src of PILOT_SOURCES) {
    if (src.policyStatus === "blocked_by_policy") {
      sourcesChecked.push({
        source_id: src.id,
        source_name: src.name,
        source_url: src.url,
        status: "skipped_policy",
        robots_txt_checked: false,
        robots_txt_allowed: false,
        reuse_conditions_summary: src.reuseConditionsSummary,
        raw_records_extracted: 0,
        error_message: null,
      });
      continue;
    }

    if (!src.enabled) {
      sourcesChecked.push({
        source_id: src.id,
        source_name: src.name,
        source_url: src.url,
        status: "skipped_disabled",
        robots_txt_checked: false,
        robots_txt_allowed: false,
        reuse_conditions_summary: src.reuseConditionsSummary,
        raw_records_extracted: 0,
        error_message: null,
      });
      continue;
    }

    // Check robots.txt
    const robotsRes = await fetchWithRetry(src.robotsTxtUrl);
    const targetPath = new URL(src.url).pathname;
    const robotsAllowed = robotsRes.ok
      ? isPathAllowedByRobotsTxt(robotsRes.text, targetPath)
      : true;

    if (!robotsAllowed) {
      sourcesChecked.push({
        source_id: src.id,
        source_name: src.name,
        source_url: src.url,
        status: "skipped_policy",
        robots_txt_checked: true,
        robots_txt_allowed: false,
        reuse_conditions_summary: `robots.txt disallowed ${targetPath}`,
        raw_records_extracted: 0,
        error_message: null,
      });
      continue;
    }

    const pageRes = await fetchWithRetry(src.url);
    const cacheFile = path.join(cacheDir, `${src.id}.html`);

    let htmlText = pageRes.text;
    if (pageRes.ok && htmlText) {
      fs.writeFileSync(cacheFile, htmlText, "utf8");
    } else if (fs.existsSync(cacheFile)) {
      htmlText = fs.readFileSync(cacheFile, "utf8");
    }

    if (!htmlText) {
      sourcesChecked.push({
        source_id: src.id,
        source_name: src.name,
        source_url: src.url,
        status: "failed",
        robots_txt_checked: true,
        robots_txt_allowed: true,
        reuse_conditions_summary: src.reuseConditionsSummary,
        raw_records_extracted: 0,
        error_message: pageRes.error ?? "Empty response body",
      });
      continue;
    }

    let parsed: RawCandidateSighting[] = [];
    if (src.id === "westonfence") {
      parsed = parseWestonfenceHtml(htmlText, nowIso);
    } else if (src.id === "rotech_rural") {
      parsed = parseRotechRuralHtml(htmlText, nowIso);
    }

    rawSightings.push(...parsed);
    sourcesChecked.push({
      source_id: src.id,
      source_name: src.name,
      source_url: src.url,
      status: "succeeded",
      robots_txt_checked: true,
      robots_txt_allowed: true,
      reuse_conditions_summary: src.reuseConditionsSummary,
      raw_records_extracted: parsed.length,
      error_message: null,
    });
  }

  // Enforce pilot bound of up to 100 candidate sightings (never manufacturing records)
  const boundedSightings = rawSightings.slice(0, PIPELINE_SETTINGS.maxPilotCandidates);

  // 3. Attach known official website URLs from matched existing DB rows if missing on directory card
  for (const s of boundedSightings) {
    if (s.website_url) continue;
    const sKey = normaliseBusinessNameKey(s.business_name);
    const dbMatch = activeFencing.find(
      (l) =>
        normaliseBusinessNameKey(l.title) === sKey &&
        l.source_platform === "official_website" &&
        l.source_url?.startsWith("http")
    );
    if (dbMatch && dbMatch.source_url) {
      s.website_url = dbMatch.source_url;
    }
  }

  // 4. Bounded official-website enrichment for candidates with an official website URL
  const websiteHtmlCache = new Map<string, string>();
  const websitesBrokenOrParked: {
    business_name: string;
    website_url: string;
    finding: string;
  }[] = [];
  let websitesCheckedCount = 0;
  let websitesSucceededCount = 0;

  for (let i = 0; i < boundedSightings.length; i++) {
    const s = boundedSightings[i];
    if (!s.website_url) continue;

    let webHtml = websiteHtmlCache.get(s.website_url) ?? "";
    if (!webHtml) {
      websitesCheckedCount++;
      const res = await fetchWithRetry(s.website_url, { timeoutMs: 10000, maxRetries: 1 });
      if (res.ok && res.text) {
        webHtml = res.text;
        websiteHtmlCache.set(s.website_url, webHtml);
        websitesSucceededCount++;
      }
    }

    if (webHtml) {
      const enriched = enrichSightingFromWebsiteHtml(s, s.website_url, webHtml, nowIso);
      boundedSightings[i] = enriched;
      if (
        enriched.website_broken_or_parked &&
        !websitesBrokenOrParked.some((w) => w.website_url === s.website_url)
      ) {
        websitesBrokenOrParked.push({
          business_name: s.business_name,
          website_url: s.website_url,
          finding:
            enriched.website_check_notes[0] ??
            "Website rendered broken or parked content.",
        });
      }
    }
  }

  // 5. Consolidate, deduplicate, classify, check ABNs, match against DB
  // Defaults to deterministic/offline (zero paid AI calls) unless allowPaidAi is true.
  const dbCompleteness =
    dbState.accessMode === "available_service_role"
      ? "complete_service_role"
      : dbState.accessMode === "available_anon"
        ? "incomplete_anon"
        : "unavailable";

  const evaluation = await consolidateAndEvaluateCandidates(
    boundedSightings,
    dbState.allListings,
    {
      useGeminiIfAvailable: Boolean(allowPaidAi && process.env.GEMINI_API_KEY),
      abnLookupGuid: process.env.ABN_LOOKUP_GUID ?? null,
      dbCompleteness,
    }
  );

  // 6. Audit existing database fencing listings for duplicates, non-rural entries, and Yellow Pages provenance issues
  const existingAudit = auditExistingFencingListings(dbState.fencingListings);
  const allExistingReviews = [
    ...evaluation.existingListingReviews,
    ...existingAudit.reviewItems,
  ];

  const byIssueType: Record<string, number> = {};
  for (const item of allExistingReviews) {
    byIssueType[item.issue_type] = (byIssueType[item.issue_type] ?? 0) + 1;
  }

  // 7. Build staged outputs
  const seedJsonObj = buildSeedJsonPayload(evaluation.candidates, nowIso);
  const seedJsonStr = JSON.stringify(seedJsonObj, null, 2) + "\n";
  const seedCsvStr = buildSeedCsv(evaluation.candidates);
  const reviewCsvStr = buildReviewCsv(evaluation.candidates, allExistingReviews);

  const acceptedNewCount = evaluation.candidates.filter(
    (c) => c.record_disposition === "seed_new"
  ).length;
  const acceptedExistingCount = evaluation.candidates.filter(
    (c) => c.record_disposition === "seed_existing_match"
  ).length;
  const reviewCount = evaluation.candidates.filter(
    (c) => c.record_disposition === "review"
  ).length;
  const excludedCount = evaluation.candidates.filter(
    (c) => c.record_disposition === "exclude"
  ).length;
  const protectedCount = evaluation.candidates.filter(
    (c) =>
      c.existing_protection_status === "protected_claimed_profile" ||
      c.existing_protection_status === "protected_owner_edited" ||
      c.existing_protection_status === "protected_suppressed_or_removed"
  ).length;

  const auditReport: PipelineAuditReport = {
    generated_at: nowIso,
    category: {
      id: FENCING_CONTRACTOR_CATEGORY.id,
      slug: FENCING_CONTRACTOR_CATEGORY.slug,
      label: FENCING_CONTRACTOR_CATEGORY.label,
      pillar: FENCING_CONTRACTOR_CATEGORY.pillar,
    },
    environment_and_credentials: {
      supabase_read_access: dbState.accessMode,
      rls_hidden_tables_note:
        dbState.accessMode === "available_anon"
          ? "Using NEXT_PUBLIC_SUPABASE_ANON_KEY (read-only). RLS hides deleted_by_admin/hidden_flagged rows, private contact columns (contact_phone/contact_email on listings, phone/email on businesses), and service_role-only tables (listing_sources, business_outreach). Verify with service_role before importing seed_new rows."
          : "Full service_role read access.",
      gemini_api_key_present: Boolean(allowPaidAi && process.env.GEMINI_API_KEY),
      gemini_model_configured: PIPELINE_SETTINGS.defaultGeminiModel,
      abn_lookup_guid_present: Boolean(process.env.ABN_LOOKUP_GUID),
    },
    existing_database_fencing_counts: {
      total_visible_fencing_rows: dbState.fencingListings.length,
      active_unclaimed_scraped: activeFencing.length,
      closed_legacy_manual: closedFencing.length,
      metro_archived_in_migrations_note: 67,
      reclassified_non_fencing_in_migrations_note: 18,
      public_homepage_total_active_all_pillars: dbState.allActiveCount,
      public_homepage_fencing_finder_count: activeFencing.length,
      public_fencing_category_page_count: activeFencing.length,
      by_source_platform: bySourcePlatform,
      yellow_pages_provenance_findings: {
        synthetic_google_search_url_count: existingAudit.syntheticGoogleSearchUrlCount,
        summary:
          "Migration 20261018103000_seo_hygiene_metro_purge_and_verification_queue.sql rewrote source_platform='yellow_pages' to 'web' and replaced yellowpages.com.au URLs with synthetic Google Search URLs (https://www.google.com/search?q=...) across 211 active/closed web fencing rows. While listing_sources still holds the original sighting rows (readable via service_role), the top-level listings.source_platform and listings.source_url no longer distinguish former Yellow Pages records from other web sources.",
      },
    },
    sources_checked: sourcesChecked,
    website_enrichment_summary: {
      websites_checked: websitesCheckedCount,
      websites_succeeded: websitesSucceededCount,
      websites_broken_or_parked: websitesBrokenOrParked,
    },
    reconciliation: {
      raw_sightings_discovered: evaluation.rawSightingsCount,
      cross_or_intra_source_duplicates_merged_or_flagged:
        evaluation.crossOrIntraSourceMergedOrFlaggedCount +
        evaluation.exactRepeatSightingsDropped,
      unique_candidates_evaluated: evaluation.candidates.length,
      accepted_seed_total: acceptedNewCount + acceptedExistingCount,
      accepted_seed_new: acceptedNewCount,
      accepted_seed_existing_matches: acceptedExistingCount,
      routed_to_review: reviewCount,
      excluded: excludedCount,
      protected_claimed_or_suppressed_skipped: protectedCount,
    },
    existing_listing_review_summary: {
      total_flagged_for_review: allExistingReviews.length,
      by_issue_type: byIssueType,
    },
  };

  const auditJsonStr = buildAuditJsonString(auditReport);

  const outputDirs =
    options?.writeToRootAndOutDir ?? true ? [outDir, repoRoot] : [outDir];

  for (const dir of outputDirs) {
    fs.writeFileSync(path.join(dir, "rural_fencers_seed.json"), seedJsonStr, "utf8");
    fs.writeFileSync(path.join(dir, "rural_fencers_seed.csv"), seedCsvStr, "utf8");
    fs.writeFileSync(path.join(dir, "rural_fencers_review.csv"), reviewCsvStr, "utf8");
    fs.writeFileSync(path.join(dir, "rural_fencers_audit.json"), auditJsonStr, "utf8");
  }

  return {
    auditReport,
    candidates: evaluation.candidates,
    existingListingReviews: allExistingReviews,
    outputPaths: {
      seedJson: path.join(outDir, "rural_fencers_seed.json"),
      seedCsv: path.join(outDir, "rural_fencers_seed.csv"),
      reviewCsv: path.join(outDir, "rural_fencers_review.csv"),
      auditJson: path.join(outDir, "rural_fencers_audit.json"),
    },
  };
}

// Execute when invoked directly from CLI
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(import.meta.filename || "").toLowerCase();

if (isMain) {
  runPilotPipeline()
    .then((res) => {
      console.log("=== Rural Fencing Contractor Pilot Complete ===");
      console.log("Reconciliation:", JSON.stringify(res.auditReport.reconciliation, null, 2));
      console.log(
        "Existing DB Fencing Counts:",
        JSON.stringify(res.auditReport.existing_database_fencing_counts, null, 2)
      );
      console.log("Outputs written to:", res.outputPaths);
    })
    .catch((err) => {
      console.error("Pilot pipeline failed:", err);
      process.exit(1);
    });
}
