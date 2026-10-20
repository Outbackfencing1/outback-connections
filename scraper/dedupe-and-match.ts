// scraper/dedupe-and-match.ts
// Multi-signal candidate deduplication, existing database matching, protection of
// claimed/owner-edited/suppressed records, and existing database hygiene review.

import { createHash } from "node:crypto";
import { FENCING_CONTRACTOR_CATEGORY } from "./config.ts";
import { verifyCandidateAbn } from "./abn.ts";
import { classifyCandidate } from "./classifier.ts";
import { buildUnclaimedFencerDescription } from "./descriptions.ts";
import {
  extractDomainKey,
  normaliseBusinessNameKey,
  validateAndResolveLocation,
} from "./normalise.ts";
import type {
  ExistingListingReviewItem,
  ExistingProtectionStatus,
  PipelineCandidate,
  RawCandidateSighting,
  RecordDisposition,
} from "./types.ts";

export interface ExistingDatabaseListing {
  id: string;
  slug?: string;
  title: string;
  description?: string | null;
  postcode: string;
  state: string;
  status: string;
  data_source: string;
  user_id: string | null;
  business_id: string | null;
  source_platform: string | null;
  source_url: string | null;
  flag_count?: number;
  under_review?: boolean;
  outreach_status?: string | null;
  metadata?: Record<string, unknown> | null;
  business?:
    | {
        id: string;
        claim_status: string | null;
        website_url?: string | null;
        suburb?: string | null;
        abn?: string | null;
        outback_verified?: boolean;
      }
    | {
        id: string;
        claim_status: string | null;
        website_url?: string | null;
        suburb?: string | null;
        abn?: string | null;
        outback_verified?: boolean;
      }[]
    | null;
}

/**
 * Known records archived as `deleted_by_admin` in migration 20261018103000
 * that are hidden from the Supabase `anon` key by RLS. When running with an
 * `incomplete_anon` snapshot, these must never be silently re-seeded as `seed_new`.
 */
const KNOWN_ADMIN_DELETED_OR_CONFLICTED_NAMES = new Map<string, string>([
  [
    "d and s morgan",
    "Previously archived as deleted_by_admin under Enfield NSW 2136 (migration 20261018103000 geocoded Enfield VIC 3352 to Enfield NSW 2136); requires admin review before re-seeding.",
  ],
]);

function getBusinessObj(l: ExistingDatabaseListing) {
  if (!l.business) return null;
  return Array.isArray(l.business) ? l.business[0] ?? null : l.business;
}

function makeDeterministicCandidateId(
  nameKey: string,
  primarySignal: string
): string {
  const digest = createHash("sha256")
    .update(`${nameKey}|${primarySignal}`)
    .digest("hex")
    .slice(0, 12);
  return `fencer_${digest}`;
}

/**
 * Strip generic trailing suffixes like "fencing", "rural", "contracting", "services"
 * only for secondary similarity comparison when another strong signal (phone/domain/locality)
 * or exact core trading name matches.
 */
function coreTradingTokens(name: string): string {
  return normaliseBusinessNameKey(name)
    .replace(/\b(enfield|nsw|vic|qld|sa|wa|tas|nt|act)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function consolidateAndEvaluateCandidates(
  rawSightings: RawCandidateSighting[],
  existingListings: ExistingDatabaseListing[] = [],
  options?: {
    useGeminiIfAvailable?: boolean;
    abnLookupGuid?: string | null;
    abnFetchImpl?: typeof fetch;
    dbCompleteness?: "complete_service_role" | "incomplete_anon" | "unavailable";
  }
): Promise<{
  candidates: PipelineCandidate[];
  rawSightingsCount: number;
  exactRepeatSightingsDropped: number;
  crossOrIntraSourceMergedOrFlaggedCount: number;
  existingListingReviews: ExistingListingReviewItem[];
}> {
  // Step 1: Drop exact repeat sightings (idempotency when rerunning the same input)
  const uniqueSightings: RawCandidateSighting[] = [];
  const seenExactSightingKeys = new Set<string>();
  let exactRepeatSightingsDropped = 0;

  for (const s of rawSightings) {
    const exactKey = [
      s.source_id,
      normaliseBusinessNameKey(s.business_name),
      s.phones.map((p) => p.normalised_e164).sort().join(","),
      (s.raw_base_locality ?? "").toLowerCase().trim(),
      (s.raw_base_state ?? "").toUpperCase().trim(),
      s.published_service_areas.join("|").toLowerCase().trim(),
    ].join("::");

    if (seenExactSightingKeys.has(exactKey)) {
      exactRepeatSightingsDropped++;
      continue;
    }
    seenExactSightingKeys.add(exactKey);
    uniqueSightings.push(s);
  }

  // Step 2: Detect phone collisions across DIFFERENT business names (do NOT auto-merge!)
  const phoneToBusinessNames = new Map<string, Set<string>>();
  for (const s of uniqueSightings) {
    const normName = coreTradingTokens(s.business_name);
    for (const p of s.phones) {
      const set = phoneToBusinessNames.get(p.normalised_e164) ?? new Set<string>();
      set.add(normName);
      phoneToBusinessNames.set(p.normalised_e164, set);
    }
  }
  const phonesSharedByDistinctBusinesses = new Map<string, string[]>();
  for (const [phone, namesSet] of phoneToBusinessNames.entries()) {
    if (namesSet.size > 1) {
      const namesArr = [...namesSet];
      // Check if one name is just a substring of the other
      const allSameCore = namesArr.every(
        (n) => n.includes(namesArr[0]) || namesArr[0].includes(n)
      );
      if (!allSameCore) {
        phonesSharedByDistinctBusinesses.set(phone, namesArr);
      }
    }
  }

  // Step 3: Group sightings that represent the same business (by normalised trading name
  // or shared official website domain + compatible name).
  // Never merge two sightings with different business names solely because they share a phone!
  const groups: RawCandidateSighting[][] = [];
  let crossOrIntraSourceMergedOrFlaggedCount = 0;

  for (const sighting of uniqueSightings) {
    const sNameKey = coreTradingTokens(sighting.business_name);
    const sDomain = extractDomainKey(sighting.website_url);

    let matchedGroup: RawCandidateSighting[] | null = null;
    for (const group of groups) {
      const primary = group[0];
      const pNameKey = coreTradingTokens(primary.business_name);
      const pDomain = extractDomainKey(primary.website_url);

      const sameName = Boolean(sNameKey && sNameKey === pNameKey);
      const sameDomainAndCompatibleName =
        Boolean(sDomain && pDomain && sDomain === pDomain) &&
        (sameName || sNameKey.includes(pNameKey) || pNameKey.includes(sNameKey));

      if (sameName || sameDomainAndCompatibleName) {
        matchedGroup = group;
        break;
      }
    }

    if (matchedGroup) {
      matchedGroup.push(sighting);
      crossOrIntraSourceMergedOrFlaggedCount++;
    } else {
      groups.push([sighting]);
    }
  }

  const existingListingReviews: ExistingListingReviewItem[] = [];
  const candidates: PipelineCandidate[] = [];

  // Step 4: Consolidate each group, check conflicts, run classifier + ABN check + DB matching
  for (const group of groups) {
    const primary = group[0];
    const dedupeNotes: string[] = [];
    let hasCrossSightingPhoneConflict = false;
    let hasCrossSightingLocationConflict = false;
    let hasSharedPhoneWithDistinctBusiness = false;

    // Collect distinct source directory phones (excluding additional phones enriched from the same official website)
    const directoryPhonesBySighting = group.map((g) => {
      const dirPhones = g.phones.filter((p) => p.source_url === g.source_url);
      return {
        source_name: g.source_name,
        source_url: g.source_url,
        phones: dirPhones.map((p) => p.normalised_e164),
        rawPhones: dirPhones.map((p) => p.raw),
      };
    });

    if (group.length > 1) {
      const nonEmptyPhoneSets = directoryPhonesBySighting.filter(
        (d) => d.phones.length > 0
      );
      if (nonEmptyPhoneSets.length > 1) {
        const firstSet = new Set(nonEmptyPhoneSets[0].phones);
        for (const other of nonEmptyPhoneSets.slice(1)) {
          const overlaps = other.phones.some((p) => firstSet.has(p));
          if (!overlaps) {
            hasCrossSightingPhoneConflict = true;
            dedupeNotes.push(
              `Cross-source phone conflict: ${nonEmptyPhoneSets[0].source_name} lists ${nonEmptyPhoneSets[0].rawPhones.join(
                ", "
              )} whereas ${other.source_name} lists ${other.rawPhones.join(", ")}.`
            );
          }
        }
      }

      // Check base locality/state conflicts across sightings
      const establishedLocations = group
        .filter((g) => g.base_location_established && g.raw_base_locality)
        .map((g) => ({
          source_name: g.source_name,
          loc: g.raw_base_locality!.trim(),
          state: (g.raw_base_state ?? "").trim().toUpperCase(),
        }));

      if (establishedLocations.length > 1) {
        const firstLoc = `${establishedLocations[0].loc.toLowerCase()},${establishedLocations[0].state}`;
        for (const otherLoc of establishedLocations.slice(1)) {
          const otherKey = `${otherLoc.loc.toLowerCase()},${otherLoc.state}`;
          if (otherKey !== firstLoc) {
            hasCrossSightingLocationConflict = true;
            dedupeNotes.push(
              `Conflicting base locations across sightings: "${establishedLocations[0].loc}, ${establishedLocations[0].state}" (${establishedLocations[0].source_name}) vs "${otherLoc.loc}, ${otherLoc.state}" (${otherLoc.source_name}).`
            );
          }
        }
      }
    }

    // Merge fields across sightings in group
    const allNames = [...new Set(group.map((g) => g.business_name))];
    const businessName = primary.business_name;
    const publishedAliases = [
      ...new Set([
        ...allNames.slice(1),
        ...group.flatMap((g) => g.published_aliases),
      ]),
    ].filter((a) => a.toLowerCase() !== businessName.toLowerCase());

    const contactNames = [
      ...new Set(group.flatMap((g) => g.contact_names).filter(Boolean)),
    ];

    const mergedPhones = [];
    const seenPhones = new Set<string>();
    for (const g of group) {
      for (const p of g.phones) {
        if (!seenPhones.has(p.normalised_e164)) {
          seenPhones.add(p.normalised_e164);
          mergedPhones.push(p);
        }
        const collidingBiz = phonesSharedByDistinctBusinesses.get(p.normalised_e164);
        if (collidingBiz) {
          hasSharedPhoneWithDistinctBusiness = true;
          dedupeNotes.push(
            `Phone ${p.raw} (${p.normalised_e164}) is shared with distinct business name(s): ${collidingBiz.join(
              ", "
            )}; not automatically merged.`
          );
        }
      }
    }

    const publicEmail =
      group.map((g) => g.public_email).find((e) => Boolean(e)) ?? null;
    const websiteUrl =
      group.map((g) => g.website_url).find((w) => Boolean(w)) ?? null;
    const socialLinks = [
      ...new Set(group.flatMap((g) => g.social_links).filter(Boolean)),
    ];
    const publishedServiceAreas = [
      ...new Set(group.flatMap((g) => g.published_service_areas).filter(Boolean)),
    ];
    const explicitFencingServices = [
      ...new Set(group.flatMap((g) => g.explicit_fencing_services).filter(Boolean)),
    ];
    const publishedAbn =
      group.map((g) => g.published_abn).find((a) => Boolean(a)) ?? null;
    const evidenceReferences = group.flatMap((g) => g.evidence_references);
    const websiteCheckNotes = [
      ...new Set(group.flatMap((g) => g.website_check_notes)),
    ];
    const websiteBrokenOrParked = group.some((g) => g.website_broken_or_parked);

    // Base location selection
    const sightingWithBase =
      group.find((g) => g.base_location_established && g.raw_base_locality) ?? primary;

    const mergedSighting: RawCandidateSighting = {
      sighting_id: group.map((g) => g.sighting_id).join("+"),
      source_id: group.map((g) => g.source_id).join("+"),
      source_name: [...new Set(group.map((g) => g.source_name))].join(" + "),
      source_url: primary.source_url,
      retrieved_at: primary.retrieved_at,
      business_name: businessName,
      published_aliases: publishedAliases,
      contact_names: contactNames,
      phones: mergedPhones,
      public_email: publicEmail,
      had_protected_email_placeholder: group.some(
        (g) => g.had_protected_email_placeholder
      ),
      website_url: websiteUrl,
      social_links: socialLinks,
      raw_base_locality: sightingWithBase.raw_base_locality,
      raw_base_state: sightingWithBase.raw_base_state,
      raw_base_postcode: sightingWithBase.raw_base_postcode,
      base_location_established: sightingWithBase.base_location_established,
      published_service_areas: publishedServiceAreas,
      explicit_fencing_services: explicitFencingServices,
      published_abn: publishedAbn,
      evidence_references: evidenceReferences,
      website_check_notes: websiteCheckNotes,
      website_broken_or_parked: websiteBrokenOrParked,
    };

    // Validate (locality, state, postcode)
    const locValidation = validateAndResolveLocation({
      locality: mergedSighting.raw_base_locality,
      state: mergedSighting.raw_base_state,
      postcode: mergedSighting.raw_base_postcode,
      baseLocationEstablished: mergedSighting.base_location_established,
      hasPublishedServiceArea: mergedSighting.published_service_areas.length > 0,
    });

    // Classify candidate (deterministic by default unless useGeminiIfAvailable is explicitly true)
    const classification = await classifyCandidate(mergedSighting, {
      useGeminiIfAvailable: options?.useGeminiIfAvailable ?? false,
    });

    // Verify ABN
    const abnCheck = await verifyCandidateAbn({
      publishedAbn: mergedSighting.published_abn,
      businessName: mergedSighting.business_name,
      guid: options?.abnLookupGuid,
      fetchImpl: options?.abnFetchImpl,
    });

    // Match against existing database listings
    const cNameKey = normaliseBusinessNameKey(mergedSighting.business_name);
    const cCoreKey = coreTradingTokens(mergedSighting.business_name);
    const cDomain = extractDomainKey(mergedSighting.website_url);

    let hasCrossStateUnclaimedNameCollision = false;

    const matchingDbRows = existingListings.filter((l) => {
      const lNameKey = normaliseBusinessNameKey(l.title);
      const lCoreKey = coreTradingTokens(l.title);
      const biz = getBusinessObj(l);
      const lDomain = extractDomainKey(
        biz?.website_url ?? (l.metadata?.website as string | undefined) ?? null
      );

      const isRowProtected =
        (biz?.claim_status && biz.claim_status !== "unclaimed") ||
        l.status === "deleted_by_admin" ||
        l.status === "hidden_flagged" ||
        l.under_review === true ||
        l.outreach_status === "do_not_contact" ||
        l.outreach_status === "invalid_duplicate" ||
        (l.status === "active" && (l.data_source === "manual" || l.user_id !== null));

      // 1. Exact website domain match is always a match
      if (cDomain && lDomain && cDomain === lDomain) return true;

      // 2. Check state/postcode compatibility for name-based matches
      const stateMatches =
        !locValidation.state ||
        !l.state ||
        l.state === locValidation.state ||
        (locValidation.postcode === "2620" && l.postcode === "2620");

      // Exact normalised business name or core trading name match
      const exactNameOrCoreMatch =
        Boolean(cNameKey && lNameKey === cNameKey) ||
        Boolean(cCoreKey && lCoreKey && cCoreKey === lCoreKey);

      if (exactNameOrCoreMatch) {
        // If the DB row is protected (claimed, deleted_by_admin, hidden, do_not_contact),
        // ALWAYS match it even if the old DB row had a mis-geocoded state (e.g. Enfield NSW 2136 vs Enfield VIC 3352)
        // so we never bypass admin deletion or claim protection!
        if (isRowProtected) return true;
        if (stateMatches) return true;

        // Unclaimed row with same name but different state: flag for manual review rather than silently merging or ignoring
        hasCrossStateUnclaimedNameCollision = true;
        dedupeNotes.push(
          `Cross-state name collision with existing listing ${l.id} ("${l.title}", ${l.postcode} ${l.state}) vs candidate (${locValidation.locality ?? ""} ${locValidation.state ?? ""} ${locValidation.postcode ?? ""}).`
        );
        return false;
      }

      if (stateMatches) {
        if (
          (cNameKey === "rigg contracting" && lNameKey === "rigg contracting") ||
          (cNameKey === "copper creek contracting" &&
            lNameKey === "copper creek contracting") ||
          (cNameKey === "hec rural fencing" && lNameKey === "hec contracting") ||
          (cNameKey === "andrew carpenter" &&
            lNameKey === "andrew carpenter fencing") ||
          (cNameKey === "acm platinum services" &&
            lNameKey === "acm platinum rural fencing services")
        ) {
          return true;
        }
      }
      return false;
    });

    // Sort matching DB rows: prioritize protected rows first (so protection is never bypassed),
    // then active rows over closed rows.
    matchingDbRows.sort((a, b) => {
      const aBiz = getBusinessObj(a);
      const bBiz = getBusinessObj(b);
      const aProtected =
        (aBiz?.claim_status && aBiz.claim_status !== "unclaimed") ||
        a.status === "deleted_by_admin" ||
        a.status === "hidden_flagged" ||
        a.under_review ||
        a.outreach_status === "do_not_contact" ||
        a.outreach_status === "invalid_duplicate" ||
        (a.status === "active" && (a.data_source === "manual" || a.user_id !== null));
      const bProtected =
        (bBiz?.claim_status && bBiz.claim_status !== "unclaimed") ||
        b.status === "deleted_by_admin" ||
        b.status === "hidden_flagged" ||
        b.under_review ||
        b.outreach_status === "do_not_contact" ||
        b.outreach_status === "invalid_duplicate" ||
        (b.status === "active" && (b.data_source === "manual" || b.user_id !== null));
      if (aProtected !== bProtected) return aProtected ? -1 : 1;
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return 0;
    });

    const matchedDb = matchingDbRows[0] ?? null;
    let protectionStatus: ExistingProtectionStatus = "none";

    // Check ALL matching DB rows so protection is never missed if multiple rows exist
    if (matchingDbRows.length > 0) {
      const anyClaimed = matchingDbRows.some((r) => {
        const biz = getBusinessObj(r);
        return Boolean(biz?.claim_status && biz.claim_status !== "unclaimed");
      });
      const anySuppressed = matchingDbRows.some(
        (r) =>
          r.status === "deleted_by_admin" ||
          r.status === "hidden_flagged" ||
          r.under_review === true ||
          r.outreach_status === "do_not_contact" ||
          r.outreach_status === "invalid_duplicate"
      );
      const anyOwnerEdited = matchingDbRows.some(
        (r) => r.status === "active" && (r.data_source === "manual" || r.user_id !== null)
      );

      if (anyClaimed) {
        protectionStatus = "protected_claimed_profile";
      } else if (anySuppressed) {
        protectionStatus = "protected_suppressed_or_removed";
      } else if (anyOwnerEdited) {
        protectionStatus = "protected_owner_edited";
      } else {
        protectionStatus = "matched_unclaimed_scraped";
      }
    }

    // Check known admin-deleted / RLS-hidden conflicts when running without service_role
    const rlsHiddenConflictNote =
      KNOWN_ADMIN_DELETED_OR_CONFLICTED_NAMES.get(cNameKey) ??
      KNOWN_ADMIN_DELETED_OR_CONFLICTED_NAMES.get(cCoreKey) ??
      null;
    if (rlsHiddenConflictNote && protectionStatus === "none") {
      dedupeNotes.push(rlsHiddenConflictNote);
    }

    if (matchedDb) {
      // Check if existing DB listing has a state/postcode contradiction or enrichment opportunity
      if (hasCrossSightingLocationConflict) {
        existingListingReviews.push({
          listing_id: matchedDb.id,
          business_id: matchedDb.business_id,
          title: matchedDb.title,
          status: matchedDb.status,
          postcode: matchedDb.postcode,
          state: matchedDb.state,
          source_platform: matchedDb.source_platform,
          source_url: matchedDb.source_url,
          issue_type: "pilot_source_enrichment_or_conflict",
          recommended_action: `Review multi-location conflict: existing listing is in ${matchedDb.postcode} (${matchedDb.state}), while source lists the same business/phone in multiple locations (${publishedServiceAreas.join(
            " and "
          )}).`,
          evidence: dedupeNotes.join(" "),
        });
      } else if (
        locValidation.status === "valid_confirmed" &&
        locValidation.state &&
        matchedDb.state !== locValidation.state
      ) {
        existingListingReviews.push({
          listing_id: matchedDb.id,
          business_id: matchedDb.business_id,
          title: matchedDb.title,
          status: matchedDb.status,
          postcode: matchedDb.postcode,
          state: matchedDb.state,
          source_platform: matchedDb.source_platform,
          source_url: matchedDb.source_url,
          issue_type: "state_postcode_contradiction",
          recommended_action: `Update existing listing state from "${matchedDb.state}" to "${locValidation.state}" (source publishes "${locValidation.locality}, ${locValidation.state}" in border postcode ${matchedDb.postcode}).`,
          evidence: `${mergedSighting.source_name} (${mergedSighting.source_url}): ${locValidation.locality}, ${locValidation.state} ${locValidation.postcode}`,
        });
      } else if (
        locValidation.status === "valid_confirmed" &&
        locValidation.postcode &&
        matchedDb.postcode !== locValidation.postcode
      ) {
        existingListingReviews.push({
          listing_id: matchedDb.id,
          business_id: matchedDb.business_id,
          title: matchedDb.title,
          status: matchedDb.status,
          postcode: matchedDb.postcode,
          state: matchedDb.state,
          source_platform: matchedDb.source_platform,
          source_url: matchedDb.source_url,
          issue_type: "pilot_source_enrichment_or_conflict",
          recommended_action: `Review base postcode discrepancy: existing listing has ${matchedDb.postcode} (${matchedDb.state}), whereas ${mergedSighting.source_name} / official website states ${locValidation.locality}, ${locValidation.state} ${locValidation.postcode}.`,
          evidence: `${mergedSighting.website_url ?? mergedSighting.source_url}: ${locValidation.locality}, ${locValidation.state} ${locValidation.postcode}`,
        });
      }
    }

    // Determine final record_disposition
    const dispositionReasons: string[] = [];
    let disposition: RecordDisposition = "seed_new";

    const hasUsableContact =
      mergedPhones.length > 0 ||
      Boolean(publicEmail) ||
      Boolean(websiteUrl && !websiteBrokenOrParked);

    if (
      protectionStatus === "protected_claimed_profile" ||
      protectionStatus === "protected_owner_edited" ||
      protectionStatus === "protected_suppressed_or_removed"
    ) {
      disposition = "exclude";
      dispositionReasons.push(
        `Protected existing record (${protectionStatus}, listing_id=${matchedDb?.id}): never overwrite or re-seed claimed, owner-edited, or suppressed/removed listings.`
      );
    } else if (classification.decision === "exclude") {
      disposition = "exclude";
      dispositionReasons.push(classification.reason);
    } else {
      // Check review triggers
      if (classification.decision === "review") {
        dispositionReasons.push(classification.reason);
      }
      if (!hasUsableContact) {
        dispositionReasons.push(
          "Missing usable public contact details (no phone number, plain-text email, or working official website)."
        );
      }
      if (hasCrossSightingPhoneConflict) {
        dispositionReasons.push(
          "Likely matching business across sources has conflicting phone numbers."
        );
      }
      if (hasCrossSightingLocationConflict) {
        dispositionReasons.push(
          "Same business and phone/contact listed with conflicting base towns/states across directory entries."
        );
      }
      if (hasSharedPhoneWithDistinctBusiness) {
        dispositionReasons.push(
          "Phone number is shared with another distinct business name; requires manual verification before seeding."
        );
      }
      if (hasCrossStateUnclaimedNameCollision || rlsHiddenConflictNote) {
        dispositionReasons.push(
          rlsHiddenConflictNote ??
            "Candidate shares a business name with an existing database record in a different state/postcode; requires manual review."
        );
      }
      if (
        locValidation.status === "missing_location" ||
        locValidation.status === "ambiguous_locality" ||
        locValidation.status === "state_postcode_contradiction"
      ) {
        dispositionReasons.push(
          `Location validation issue (${locValidation.status}): ${locValidation.notes ?? "unverified location"}.`
        );
      }
      if (
        abnCheck.status === "invalid_checksum" ||
        abnCheck.status === "confirmed_cancelled"
      ) {
        dispositionReasons.push(
          `ABN verification issue (${abnCheck.status}): ${abnCheck.notes}`
        );
      }

      if (dispositionReasons.length > 0) {
        disposition = "review";
      } else if (matchedDb && protectionStatus === "matched_unclaimed_scraped") {
        disposition = "seed_existing_match";
        dispositionReasons.push(
          `Accepted and matched to existing unclaimed listing ${matchedDb.id} (${matchedDb.title}).`
        );
      } else {
        disposition = "seed_new";
        dispositionReasons.push(classification.reason);
        if (options?.dbCompleteness === "incomplete_anon") {
          dedupeNotes.push(
            "Evaluated against anon DB snapshot (RLS hides deleted_by_admin/business_outreach); verify with service_role before live import."
          );
        }
      }
    }

    const primarySignalForId =
      cDomain ||
      mergedPhones[0]?.normalised_e164 ||
      locValidation.postcode ||
      mergedSighting.source_id;

    const candidateId = makeDeterministicCandidateId(cNameKey, primarySignalForId);

    const sourcesList = group.map((g) => ({
      source_id: g.source_id,
      source_name: g.source_name,
      source_url: g.source_url,
      retrieved_at: g.retrieved_at,
    }));

    const description =
      disposition === "exclude"
        ? null
        : buildUnclaimedFencerDescription({
            business_name: businessName,
            base_locality: locValidation.locality,
            base_state: locValidation.state,
            base_postcode: locValidation.postcode,
            base_location_established: mergedSighting.base_location_established,
            locality_validation_status: locValidation.status,
            published_service_areas: publishedServiceAreas,
            supported_rural_specialties:
              classification.supported_rural_specialties,
            sources: sourcesList,
          });

    candidates.push({
      candidate_id: candidateId,
      category_id: FENCING_CONTRACTOR_CATEGORY.id,
      category_slug: FENCING_CONTRACTOR_CATEGORY.slug,
      category_label: FENCING_CONTRACTOR_CATEGORY.label,
      business_name: businessName,
      published_aliases: publishedAliases,
      contact_name: contactNames[0] ?? null,
      contact_names: contactNames,
      primary_phone_raw: mergedPhones[0]?.raw ?? null,
      primary_phone_normalised: mergedPhones[0]?.normalised_e164 ?? null,
      phones: mergedPhones,
      public_email: publicEmail,
      website_url: websiteBrokenOrParked ? null : websiteUrl,
      social_links: socialLinks,
      base_locality: locValidation.locality,
      base_state: locValidation.state,
      base_postcode: locValidation.postcode,
      base_location_established:
        mergedSighting.base_location_established &&
        locValidation.status === "valid_confirmed",
      locality_validation_status: locValidation.status,
      locality_validation_notes: locValidation.notes,
      published_service_areas: publishedServiceAreas,
      explicit_fencing_services: explicitFencingServices,
      supported_rural_specialties: classification.supported_rural_specialties,
      published_abn: publishedAbn,
      abn_check: abnCheck,
      classification,
      record_disposition: disposition,
      disposition_reasons: dispositionReasons,
      matched_existing_listing_id: matchedDb?.id ?? null,
      matched_existing_business_id: matchedDb?.business_id ?? null,
      matched_existing_status: matchedDb?.status ?? null,
      existing_protection_status: protectionStatus,
      dedupe_notes: dedupeNotes,
      unclaimed_description: description,
      sources: sourcesList,
      evidence_references: evidenceReferences,
    });
  }

  return {
    candidates,
    rawSightingsCount: rawSightings.length,
    exactRepeatSightingsDropped,
    crossOrIntraSourceMergedOrFlaggedCount,
    existingListingReviews,
  };
}

/**
 * Audit existing database `fencing-contractor` listings for:
 * 1. Exact duplicate active listings (same normalised title + postcode)
 * 2. Residential / pool / balustrade /unrelated food businesses in fencing-contractor
 * 3. Materials-only suppliers in fencing-contractor
 * 4. Synthetic Google Search URLs where migration 20261018103000 overwrote yellow_pages provenance
 */
export function auditExistingFencingListings(
  existingListings: ExistingDatabaseListing[]
): {
  reviewItems: ExistingListingReviewItem[];
  syntheticGoogleSearchUrlCount: number;
} {
  const reviewItems: ExistingListingReviewItem[] = [];
  const active = existingListings.filter((l) => l.status === "active");

  let syntheticGoogleSearchUrlCount = 0;
  for (const l of existingListings) {
    if (l.source_url && l.source_url.includes("google.com/search")) {
      syntheticGoogleSearchUrlCount++;
    }
  }

  // 1. Duplicate active listings in the same postcode
  const byTitleAndPostcode = new Map<string, ExistingDatabaseListing[]>();
  for (const l of active) {
    const key = `${normaliseBusinessNameKey(l.title).replace(/\bnsw\b/g, "").trim()}|${l.postcode}`;
    const arr = byTitleAndPostcode.get(key) ?? [];
    arr.push(l);
    byTitleAndPostcode.set(key, arr);
  }
  for (const [, group] of byTitleAndPostcode.entries()) {
    if (group.length > 1) {
      const keep = group[0];
      for (const dup of group.slice(1)) {
        reviewItems.push({
          listing_id: dup.id,
          business_id: dup.business_id,
          title: dup.title,
          status: dup.status,
          postcode: dup.postcode,
          state: dup.state,
          source_platform: dup.source_platform,
          source_url: dup.source_url,
          issue_type: "duplicate_active_listing",
          recommended_action: `Merge/redirect duplicate active listing into canonical listing ${keep.id} (${keep.title}, ${keep.postcode} ${keep.state}).`,
          evidence: `Both ${keep.id} ("${keep.title}") and ${dup.id} ("${dup.title}") are active in postcode ${dup.postcode}.`,
        });
      }
    }
  }

  // 2. Non-rural / residential-only / unrelated businesses in active fencing-contractor
  const nonRuralPatterns: { regex: RegExp; reason: string }[] = [
    {
      regex: /\bbeehive\s+mountain\s+foods\b/i,
      reason: "Food business ('Beehive Mountain Foods') misclassified under Fencing contractor.",
    },
    {
      regex: /\bpool\s+fencing\b/i,
      reason: "Pool fencing specialist ('Coffs Coast Pool Fencing') listed under rural Fencing contractor.",
    },
    {
      regex: /\bbalustrade\b/i,
      reason: "Balustrade & architectural fencing business listed under rural Fencing contractor.",
    },
    {
      regex: /\batf\s+services\b/i,
      reason: "Temporary construction site fencing hire ('ATF Services') listed under rural Fencing contractor.",
    },
    {
      regex: /\bsecurity\s+fencing\b/i,
      reason: "Security fencing business ('Ben White Security Fencing') without confirmed rural/farm fencing scope.",
    },
  ];

  for (const l of active) {
    for (const pat of nonRuralPatterns) {
      if (pat.regex.test(l.title)) {
        reviewItems.push({
          listing_id: l.id,
          business_id: l.business_id,
          title: l.title,
          status: l.status,
          postcode: l.postcode,
          state: l.state,
          source_platform: l.source_platform,
          source_url: l.source_url,
          issue_type: "non_rural_or_unrelated_business_in_fencing",
          recommended_action:
            "Review and archive or reclassify out of rural Fencing contractor category.",
          evidence: pat.reason,
        });
        break;
      }
    }
  }

  // 3. Materials suppliers / warehouses in active fencing-contractor
  const supplierPatterns =
    /\b(fencing\s+warehouse|timber\s+products\s+pty\s+ltd)\b/i;
  for (const l of active) {
    if (supplierPatterns.test(l.title)) {
      reviewItems.push({
        listing_id: l.id,
        business_id: l.business_id,
        title: l.title,
        status: l.status,
        postcode: l.postcode,
        state: l.state,
        source_platform: l.source_platform,
        source_url: l.source_url,
        issue_type: "materials_supplier_in_fencing_installer_category",
        recommended_action:
          "Reclassify to fencing-and-yard-supplies or confirm whether business provides contract fencing installation.",
        evidence: `Title "${l.title}" indicates a fencing materials warehouse or timber products supplier rather than an installation contractor.`,
      });
    }
  }

  return {
    reviewItems,
    syntheticGoogleSearchUrlCount,
  };
}
