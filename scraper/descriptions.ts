// scraper/descriptions.ts
// Post-classification factual description generator for unclaimed rural fencing listings.
// Strictly follows Section 7:
// - Uses "based in [Town, State]" ONLY when a base location is actually established.
// - Otherwise uses: "[Business Name] is listed by [Source Name] as providing [supported service] in [published service area]."
// - Mentions only supported services and service areas.
// - Clearly represents the listing as unclaimed and not posted by the business.
// - Avoids marketing fluff ("trusted", "leading", "fully insured", "accredited", etc.).

import type { PipelineCandidate } from "./types.ts";

const FORBIDDEN_MARKETING_FLUFF =
  /\b(trusted|leading|premier|best\s+in|number\s+one|#1|fully\s+insured|guaranteed|award[\s-]winning|top[\s-]rated|nationwide|australia[\s-]wide\s+coverage|years\s+of\s+experience)\b/i;

export function buildUnclaimedFencerDescription(candidate: {
  business_name: string;
  base_locality: string | null;
  base_state: string | null;
  base_postcode: string | null;
  base_location_established: boolean;
  locality_validation_status: string;
  published_service_areas: string[];
  supported_rural_specialties: string[];
  sources: { source_name: string }[];
}): string {
  const bName = candidate.business_name.trim();
  const sourceNames = [
    ...new Set(candidate.sources.map((s) => s.source_name.trim()).filter(Boolean)),
  ];
  const sourceLabel =
    sourceNames.length > 0 ? sourceNames.join(" and ") : "public directory sources";

  const servicesList =
    candidate.supported_rural_specialties.length > 0
      ? candidate.supported_rural_specialties
          .map((s) => s.toLowerCase())
          .join(", ")
      : "rural fencing services";

  const hasEstablishedBase =
    candidate.base_location_established &&
    candidate.locality_validation_status === "valid_confirmed" &&
    Boolean(candidate.base_locality) &&
    Boolean(candidate.base_state);

  const nonDuplicateServiceAreas = candidate.published_service_areas.filter((area) => {
    if (!hasEstablishedBase) return true;
    const baseTag = `${candidate.base_locality}, ${candidate.base_state}`.toLowerCase();
    return area.trim().toLowerCase() !== baseTag;
  });

  let leadSentence: string;
  if (hasEstablishedBase) {
    const locLabel = candidate.base_postcode
      ? `${candidate.base_locality}, ${candidate.base_state} ${candidate.base_postcode}`
      : `${candidate.base_locality}, ${candidate.base_state}`;
    const serviceAreaClause =
      nonDuplicateServiceAreas.length > 0
        ? `, servicing ${nonDuplicateServiceAreas.join("; ")}`
        : "";
    leadSentence = `${bName} is based in ${locLabel} and is listed by ${sourceLabel} as providing ${servicesList}${serviceAreaClause}.`;
  } else {
    const areaLabel =
      candidate.published_service_areas.length > 0
        ? candidate.published_service_areas.join("; ")
        : candidate.base_state ?? "regional Australia";
    leadSentence = `${bName} is listed by ${sourceLabel} as providing ${servicesList} in ${areaLabel}.`;
  }

  return `${leadSentence} Unclaimed directory listing — not posted by the business.`;
}

export function isDescriptionCompliant(
  description: string,
  baseLocationEstablished: boolean
): { valid: boolean; reason: string | null } {
  if (FORBIDDEN_MARKETING_FLUFF.test(description)) {
    return {
      valid: false,
      reason: "Description contains forbidden marketing or unverified claim terms.",
    };
  }
  if (!baseLocationEstablished && /\bbased in\b/i.test(description)) {
    return {
      valid: false,
      reason: 'Description uses "based in" when base_location_established is false.',
    };
  }
  if (!/\bunclaimed\b/i.test(description)) {
    return {
      valid: false,
      reason: "Description is missing the unclaimed listing disclosure.",
    };
  }
  return { valid: true, reason: null };
}
