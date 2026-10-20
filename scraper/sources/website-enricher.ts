// scraper/sources/website-enricher.ts
// Bounded official-website enricher for rural fencing contractor candidates.
// Extracts plain-text public emails, published ABNs, base addresses, additional phones,
// and verbatim rural fencing specialty evidence, while detecting broken/paywalled websites.

import { extractAbnDigits } from "../abn.ts";
import {
  decodeHtmlEntities,
  extractPublicEmail,
  normaliseAustralianPhone,
} from "../normalise.ts";
import type { EvidenceReference, RawCandidateSighting } from "../types.ts";

const SPECIALTY_PATTERNS: { label: string; regex: RegExp }[] = [
  { label: "Rural fencing", regex: /\b(rural\s+fenc\w*|farm\s+fenc\w*|agricultural\s+fenc\w*)\b/i },
  { label: "Exclusion fencing", regex: /\b(exclusion\s+fenc\w*|pest\s+exclusion)\b/i },
  { label: "Electric fencing", regex: /\b(electric\s+fenc\w*|weston\s*fenc\w*)\b/i },
  { label: "High tensile fencing", regex: /\b(high[\s-]tensile)\b/i },
  { label: "Boundary & internal paddock fencing", regex: /\b(boundary\s+fenc\w*|internal\s+fenc\w*|paddock\s+fenc\w*)\b/i },
  { label: "Stock & horse fencing", regex: /\b(stock\s+and\s+horse\s+fenc\w*|horse\s+fenc\w*|livestock\s+fenc\w*|cattle\s+fenc\w*|sheep\s+fenc\w*)\b/i },
  { label: "Post and rail fencing", regex: /\b(post[\s-]+and[\s-]+rail|post\s*&\s*rail)\b/i },
  { label: "Cattle grids & stock grids", regex: /\b(cattle\s+grids?|stock\s+grids?)\b/i },
  { label: "Fence repairs & removal", regex: /\b(fence\s+repairs?|removal\s+of\s+old\s+fencing|fencing\s+services,\s+including\s+installation,\s+repairs)\b/i },
  { label: "Cattle & sheep yards", regex: /\b(cattle\s+yards?|sheep\s+yards?|stock\s+yards?|livestock\s+yards?)\b/i },
  { label: "Post driving & ramming", regex: /\b(post\s+driv\w*|post\s+ramm\w*|post\s+knocker)\b/i },
];

export function htmlToReadableText(rawHtml: string): string {
  const titleMatch = rawHtml.match(/<title>([\s\S]*?)<\/title>/i);
  const metaDescMatch = rawHtml.match(
    /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
  );
  const bodyIdx = rawHtml.toLowerCase().indexOf("<body");
  const bodySlice = bodyIdx !== -1 ? rawHtml.slice(bodyIdx) : rawHtml;

  const cleanedBody = bodySlice
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const parts = [
    titleMatch ? decodeHtmlEntities(titleMatch[1]) : "",
    metaDescMatch ? decodeHtmlEntities(metaDescMatch[1]) : "",
    decodeHtmlEntities(cleanedBody),
  ].filter(Boolean);

  return parts.join(" | ").replace(/\s+/g, " ").trim();
}

export function enrichSightingFromWebsiteHtml(
  sighting: RawCandidateSighting,
  websiteUrl: string,
  rawHtml: string,
  retrievedAt: string = new Date().toISOString()
): RawCandidateSighting {
  const readable = htmlToReadableText(rawHtml);

  // 1. Detect broken, hijacked, or unpaid SaaS billing walls (e.g. rkgconx.com.au)
  if (
    /We missed your monthly membership payment|Task Elites Toolbox|This domain is for sale| Buy this domain/i.test(
      readable
    )
  ) {
    return {
      ...sighting,
      website_broken_or_parked: true,
      website_check_notes: [
        ...sighting.website_check_notes,
        `Official website (${websiteUrl}) did not render contractor content (displayed "Task Elites Toolbox / We missed your monthly membership payment" wall).`,
      ],
    };
  }

  const updated: RawCandidateSighting = {
    ...sighting,
    published_aliases: [...sighting.published_aliases],
    contact_names: [...sighting.contact_names],
    phones: [...sighting.phones],
    social_links: [...sighting.social_links],
    published_service_areas: [...sighting.published_service_areas],
    explicit_fencing_services: [...sighting.explicit_fencing_services],
    evidence_references: [...sighting.evidence_references],
    website_check_notes: [...sighting.website_check_notes],
  };

  if (!updated.website_url) {
    updated.website_url = websiteUrl;
  }

  // 2. Public email in plain text on the contractor's own website
  if (!updated.public_email) {
    const { email } = extractPublicEmail(rawHtml);
    if (email) {
      updated.public_email = email;
      updated.evidence_references.push({
        source_name: `${sighting.business_name} Official Website`,
        source_url: websiteUrl,
        retrieved_at: retrievedAt,
        excerpt: `Published contact email on official website: ${email}`,
        supports: "contact",
      });
    }
  }

  // 3. Published ABN on the contractor's own website
  if (!updated.published_abn) {
    const abn = extractAbnDigits(readable);
    if (abn) {
      updated.published_abn = abn;
      updated.evidence_references.push({
        source_name: `${sighting.business_name} Official Website`,
        source_url: websiteUrl,
        retrieved_at: retrievedAt,
        excerpt: `Published ABN on official website: ${abn}`,
        supports: "identity",
      });
    }
  }

  // 4. Additional phone numbers with optional contact labels (e.g. "DAN -0429111066 DEAN- 0493149294")
  const namedPhoneRegex =
    /\b([A-Z][a-zA-Z]{1,15})\s*[-–:]\s*(\+?61\s*4\d{2}\s*\d{3}\s*\d{3}|04\d{2}\s*\d{3}\s*\d{3}|\(0[2378]\)\s*\d{4}\s*\d{4}|0[2378]\s*\d{4}\s*\d{4})\b/g;
  let pm: RegExpExecArray | null;
  while ((pm = namedPhoneRegex.exec(readable)) !== null) {
    const label = pm[1].trim();
    const rawP = pm[2].trim();
    if (/^(PHONE|CALL|TEL|FAX|ABN|MOB|MOBILE)$/i.test(label)) continue;
    const norm = normaliseAustralianPhone(rawP, {
      contactName: label,
      sourceUrl: websiteUrl,
    });
    if (norm && !updated.phones.some((p) => p.normalised_e164 === norm.normalised_e164)) {
      updated.phones.push(norm);
      updated.website_check_notes.push(
        `Official website (${websiteUrl}) lists phone ${norm.raw} (${label}).`
      );
    }
  }

  // 5. Base address / locality extraction when explicitly published on contractor website
  // Pattern A: "The Escort Way, Boree New South Wales 2800, Australia"
  const nswFullMatch = readable.match(
    /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+New\s+South\s+Wales\s+(2\d{3})\b/
  );
  if (nswFullMatch && !updated.base_location_established) {
    updated.raw_base_locality = nswFullMatch[1].trim();
    updated.raw_base_state = "NSW";
    updated.raw_base_postcode = nswFullMatch[2].trim();
    updated.base_location_established = true;
    updated.evidence_references.push({
      source_name: `${sighting.business_name} Official Website`,
      source_url: websiteUrl,
      retrieved_at: retrievedAt,
      excerpt: nswFullMatch[0],
      supports: "location",
    });
  }

  // Pattern B: "17 Cromie Street, Murtoa VIC, Australia"
  const streetVicMatch = readable.match(
    /\b\d+\s+[A-Z][a-zA-Z]+\s+(?:Street|St|Road|Rd|Highway|Hwy),\s*([A-Z][a-zA-Z]+)\s+(VIC|NSW|QLD|SA|WA|TAS|NT|ACT)\b/
  );
  if (streetVicMatch) {
    const webLocality = streetVicMatch[1].trim();
    const webState = streetVicMatch[2].toUpperCase();
    if (!updated.base_location_established) {
      updated.raw_base_locality = webLocality;
      updated.raw_base_state = webState;
      updated.base_location_established = true;
    } else if (
      updated.raw_base_locality &&
      updated.raw_base_locality.toLowerCase() !== webLocality.toLowerCase()
    ) {
      updated.website_check_notes.push(
        `Official website (${websiteUrl}) lists street address in ${webLocality}, ${webState}, whereas directory source listed ${updated.raw_base_locality}, ${updated.raw_base_state}.`
      );
    }
    updated.evidence_references.push({
      source_name: `${sighting.business_name} Official Website`,
      source_url: websiteUrl,
      retrieved_at: retrievedAt,
      excerpt: streetVicMatch[0],
      supports: "location",
    });
  }

  // 6. Servicing areas stated on website
  const servicingMatch = readable.match(
    /\bServicing\s+([A-Z][a-zA-Z,\s&]+?(?:NSW|VIC|QLD|SA|WA|TAS|NT|ACT))\b/
  );
  if (servicingMatch) {
    const areaStr = servicingMatch[1].trim();
    if (!updated.published_service_areas.includes(areaStr)) {
      updated.published_service_areas.push(areaStr);
    }
  }

  // 7. Extract explicit rural fencing specialties with verbatim excerpts
  for (const spec of SPECIALTY_PATTERNS) {
    const m = spec.regex.exec(readable);
    if (m) {
      if (!updated.explicit_fencing_services.includes(spec.label)) {
        updated.explicit_fencing_services.push(spec.label);
      }
      const start = Math.max(0, m.index - 60);
      const end = Math.min(readable.length, m.index + m[0].length + 100);
      const excerpt = readable.slice(start, end).trim();
      updated.evidence_references.push({
        source_name: `${sighting.business_name} Official Website`,
        source_url: websiteUrl,
        retrieved_at: retrievedAt,
        excerpt,
        supports: "specialty",
      });
    }
  }

  return updated;
}
