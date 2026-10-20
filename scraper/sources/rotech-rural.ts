// scraper/sources/rotech-rural.ts
// Source adapter for Rotech Rural Fencing Contractors (https://rotechrural.com.au/fencing-contractors/).

import { PILOT_SOURCES } from "../config.ts";
import {
  decodeHtmlEntities,
  extractPublicEmail,
  normaliseAustralianPhone,
  normaliseWebsiteUrl,
} from "../normalise.ts";
import type { EvidenceReference, PhoneRecord, RawCandidateSighting } from "../types.ts";

const ROTECH_SOURCE = PILOT_SOURCES.find((s) => s.id === "rotech_rural")!;

export function parseRotechRuralHtml(
  rawHtml: string,
  retrievedAt: string = new Date().toISOString()
): RawCandidateSighting[] {
  // Strip <script> blocks first so JS card templates inside scripts are never extracted
  const noScriptHtml = rawHtml.replace(/<script\b[\s\S]*?<\/script>/gi, "");

  const containerStart = noScriptHtml.indexOf('id="contractor-cards"');
  const mainEnd =
    containerStart !== -1 ? noScriptHtml.indexOf("</main>", containerStart) : -1;
  const cardsSection =
    containerStart !== -1
      ? noScriptHtml.slice(containerStart, mainEnd !== -1 ? mainEnd : undefined)
      : noScriptHtml;

  const cardBodies = [
    ...cardsSection.matchAll(
      /<div class="rr-contractor-card__body[\s\S]*?<\/div>\s*<\/div>/gi
    ),
  ].map((m) => m[0].trim());

  const sightings: RawCandidateSighting[] = [];

  for (let i = 0; i < cardBodies.length; i++) {
    const cardHtml = cardBodies[i];

    const titleMatch = cardHtml.match(/<h3\b[^>]*class="[^"]*rr-card-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i);
    if (!titleMatch) continue;
    const businessName = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, ""));
    if (!businessName) continue;

    // Exclude supplier name if ever present
    if (
      ROTECH_SOURCE.supplierBlocklist.supplierNames.some(
        (s) => s.toLowerCase() === businessName.toLowerCase()
      )
    ) {
      continue;
    }

    const badgeMatch = cardHtml.match(
      /<span\b[^>]*class="[^"]*rr-advocate-badge[^"]*"[^>]*>([\s\S]*?)<\/span>/i
    );
    const badgeText = badgeMatch
      ? decodeHtmlEntities(badgeMatch[1].replace(/<[^>]+>/g, ""))
      : "Rotech Rural Fencing Contractors Directory";

    // Extract locality & state from <p class="... rr-city">LOCALITY, STATE</p>
    const cityMatch = cardHtml.match(
      /<p\b[^>]*class="[^"]*rr-city[^"]*"[^>]*>([\s\S]*?)<\/p>/i
    );
    let rawLocality: string | null = null;
    let rawState: string | null = null;
    let baseLocationEstablished = false;

    if (cityMatch) {
      const cityText = decodeHtmlEntities(cityMatch[1].replace(/<[^>]+>/g, ""));
      const parts = cityText.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        rawLocality = parts.slice(0, -1).join(", ");
        rawState = parts[parts.length - 1].toUpperCase();
        baseLocationEstablished = true;
      } else if (parts.length === 1) {
        rawLocality = parts[0];
        baseLocationEstablished = true;
      }
    }

    // Contact name
    const contactNames: string[] = [];
    const contactMatch = cardHtml.match(/<b>\s*Contact:\s*<\/b>\s*([\s\S]*?)<\/p>/i);
    if (contactMatch) {
      const cName = decodeHtmlEntities(contactMatch[1].replace(/<[^>]+>/g, ""));
      if (cName) contactNames.push(cName);
    }

    // Phone number
    const phones: PhoneRecord[] = [];
    const phoneMatch = cardHtml.match(/<b>\s*Phone:\s*<\/b>\s*([\s\S]*?)<\/p>/i);
    if (phoneMatch) {
      const pRaw = decodeHtmlEntities(phoneMatch[1].replace(/<[^>]+>/g, ""));
      const phoneRec = normaliseAustralianPhone(pRaw, {
        contactName: contactNames[0] ?? null,
        sourceUrl: ROTECH_SOURCE.url,
        supplierBlocklist: ROTECH_SOURCE.supplierBlocklist,
      });
      if (phoneRec) {
        phones.push(phoneRec);
      }
    }

    // Public email (strictly rejecting Cloudflare /cdn-cgi/l/email-protection / [email protected])
    const { email: publicEmail, hadProtectedPlaceholder } = extractPublicEmail(
      cardHtml,
      ROTECH_SOURCE.supplierBlocklist
    );

    // Website & social links
    let websiteUrl: string | null = null;
    const socialLinks: string[] = [];
    for (const anchor of cardHtml.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = decodeHtmlEntities(anchor[1]).trim();
      if (
        !href ||
        href.startsWith("tel:") ||
        href.startsWith("mailto:") ||
        href.includes("/cdn-cgi/l/email-protection") ||
        /^javascript:/i.test(href)
      ) {
        continue;
      }
      if (/facebook\.com|linkedin\.com|instagram\.com/i.test(href)) {
        if (
          !ROTECH_SOURCE.supplierBlocklist.supplierDomainsLower.some((d) =>
            href.toLowerCase().includes(d)
          ) &&
          !socialLinks.includes(href)
        ) {
          socialLinks.push(href);
        }
      } else {
        const normWeb = normaliseWebsiteUrl(href, ROTECH_SOURCE.supplierBlocklist);
        if (normWeb && !websiteUrl) {
          websiteUrl = normWeb;
        }
      }
    }

    const publishedAliases: string[] = [];
    if (/^D\s*&\s*S\s+Morgan\s+Fencing\s+Pty\s+Ltd\s+Enfield$/i.test(businessName)) {
      publishedAliases.push("D & S Morgan Fencing Pty Ltd");
    }

    const cardPlainExcerpt = decodeHtmlEntities(
      cardHtml
        .replace(/<a\b[^>]*email-protection[^>]*>[\s\S]*?<\/a>/gi, "[protected-email-omitted]")
        .replace(/<[^>]+>/g, " ")
    );

    const explicitServices: string[] = [];
    if (/\b(rural\s+fencing|farm\s+fencing)\b/i.test(businessName)) {
      explicitServices.push("Rural fencing");
    } else if (/\bfencing\b/i.test(businessName)) {
      explicitServices.push("Fencing contracting (listed in Rotech Rural Fencing Contractors directory)");
    }

    const evidence: EvidenceReference[] = [
      {
        source_name: ROTECH_SOURCE.name,
        source_url: ROTECH_SOURCE.url,
        retrieved_at: retrievedAt,
        excerpt: `Fencing Contractors directory (${badgeText}): ${cardPlainExcerpt}`,
        supports: "rural_relevance",
      },
    ];

    sightings.push({
      sighting_id: `rotech_rural:${i}`,
      source_id: ROTECH_SOURCE.id,
      source_name: ROTECH_SOURCE.name,
      source_url: ROTECH_SOURCE.url,
      retrieved_at: retrievedAt,
      business_name: businessName,
      published_aliases: publishedAliases,
      contact_names: contactNames,
      phones,
      public_email: publicEmail,
      had_protected_email_placeholder: hadProtectedPlaceholder,
      website_url: websiteUrl,
      social_links: socialLinks,
      raw_base_locality: rawLocality,
      raw_base_state: rawState,
      raw_base_postcode: null,
      base_location_established: baseLocationEstablished,
      published_service_areas:
        rawLocality && rawState ? [`${rawLocality}, ${rawState}`] : [],
      explicit_fencing_services: explicitServices,
      published_abn: null,
      evidence_references: evidence,
      website_check_notes: [],
      website_broken_or_parked: false,
    });
  }

  return sightings;
}
