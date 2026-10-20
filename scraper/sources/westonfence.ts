// scraper/sources/westonfence.ts
// Source adapter for Westonfence Accredited Installers (https://westonfence.com.au/accredited-installers/).

import { PILOT_SOURCES } from "../config.ts";
import {
  decodeHtmlEntities,
  extractPublicEmail,
  normaliseAustralianPhone,
  normaliseWebsiteUrl,
} from "../normalise.ts";
import type { EvidenceReference, PhoneRecord, RawCandidateSighting } from "../types.ts";

const WESTONFENCE_SOURCE = PILOT_SOURCES.find((s) => s.id === "westonfence")!;

function inferSingleStateFromArea(areaText: string): string | null {
  const statesFound = new Set<string>();
  const re = /\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(areaText)) !== null) {
    statesFound.add(m[1]);
  }
  return statesFound.size === 1 ? [...statesFound][0] : null;
}

export function parseWestonfenceHtml(
  rawHtml: string,
  retrievedAt: string = new Date().toISOString()
): RawCandidateSighting[] {
  const mainStart = rawHtml.indexOf('id="main-content"');
  const footerStart = rawHtml.indexOf("<footer", mainStart !== -1 ? mainStart : 0);
  const mainHtml =
    mainStart !== -1
      ? rawHtml.slice(mainStart, footerStart !== -1 ? footerStart : undefined)
      : rawHtml;

  const textBlocks = [
    ...mainHtml.matchAll(/<div class="et_pb_text_inner">([\s\S]*?)<\/div>/gi),
  ].map((m) => m[1].trim());

  const introBlockHtml = textBlocks[0] || "";
  const introText = decodeHtmlEntities(introBlockHtml.replace(/<[^>]+>/g, " "));
  const directoryEvidenceExcerpt =
    introText.includes("electric fencing for livestock containment")
      ? "Westonfence™ works with a trusted network of accredited installers across Australia, experienced in installing electric fencing for livestock containment and invasive pest exclusion."
      : introText.slice(0, 240);

  const sightings: RawCandidateSighting[] = [];

  for (let i = 0; i < textBlocks.length; i++) {
    const blockHtml = textBlocks[i];
    // Skip intro heading block and footer CTA block
    if (/Our Accredited Installers|Don['’&#8217;]*t See a Contractor/i.test(blockHtml)) {
      continue;
    }

    const nameMatch = blockHtml.match(/<p[^>]*>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>/i);
    if (!nameMatch) continue;
    const businessName = decodeHtmlEntities(nameMatch[1].replace(/<[^>]+>/g, ""));
    if (!businessName) continue;

    // Reject if supplier name accidentally appears
    if (
      WESTONFENCE_SOURCE.supplierBlocklist.supplierNames.some(
        (s) => s.toLowerCase() === businessName.toLowerCase()
      )
    ) {
      continue;
    }

    // Extract contact & phone lines
    const paragraphs = [...blockHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
    const contactNames: string[] = [];
    const phones: PhoneRecord[] = [];
    const seenPhoneRoleKey = new Set<string>();

    // Paragraph 2 typically holds "Contact Name – 04xx xxx xxx<br />Contact 2 – 04xx xxx xxx"
    for (const pHtml of paragraphs.slice(1)) {
      if (/^\s*(Email|Area|Website|Facebook|Linkedin)\s*:/i.test(decodeHtmlEntities(pHtml.replace(/<[^>]+>/g, "")))) {
        continue;
      }
      const lines = pHtml.split(/<br\s*\/?>/i);
      for (const lineHtml of lines) {
        const lineText = decodeHtmlEntities(lineHtml.replace(/<[^>]+>/g, ""));
        if (!lineText) continue;
        const parts = lineText.split(/\s+[–—-]\s+/);
        if (parts.length >= 2) {
          const contactName = parts[0].trim();
          const phoneRaw = parts.slice(1).join(" - ").trim();
          if (contactName && !contactNames.includes(contactName)) {
            contactNames.push(contactName);
          }
          const phoneRec = normaliseAustralianPhone(phoneRaw, {
            contactName,
            sourceUrl: WESTONFENCE_SOURCE.url,
            supplierBlocklist: WESTONFENCE_SOURCE.supplierBlocklist,
          });
          if (phoneRec) {
            const key = `${phoneRec.normalised_e164}:${phoneRec.contact_name ?? ""}`;
            if (!seenPhoneRoleKey.has(key)) {
              seenPhoneRoleKey.add(key);
              phones.push(phoneRec);
            }
          }
        }
      }
    }

    // Email check (strictly rejecting protected-email placeholders)
    const { email: publicEmail, hadProtectedPlaceholder } = extractPublicEmail(
      blockHtml,
      WESTONFENCE_SOURCE.supplierBlocklist
    );

    // Extract Website and Social links
    let websiteUrl: string | null = null;
    const socialLinks: string[] = [];
    for (const anchor of blockHtml.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const href = decodeHtmlEntities(anchor[1]).trim();
      if (!href || /^javascript:/i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:")) {
        continue;
      }
      if (/facebook\.com|linkedin\.com|instagram\.com/i.test(href)) {
        if (
          !WESTONFENCE_SOURCE.supplierBlocklist.supplierDomainsLower.some((d) =>
            href.toLowerCase().includes(d)
          ) &&
          !socialLinks.includes(href)
        ) {
          socialLinks.push(href);
        }
      } else {
        const normWeb = normaliseWebsiteUrl(href, WESTONFENCE_SOURCE.supplierBlocklist);
        if (normWeb && !websiteUrl) {
          websiteUrl = normWeb;
        }
      }
    }

    // Extract Area (published service area, NOT base town)
    const publishedServiceAreas: string[] = [];
    for (const pHtml of paragraphs) {
      const plain = decodeHtmlEntities(pHtml.replace(/<[^>]+>/g, ""));
      const areaMatch = plain.match(/^Area\s*:\s*(.+)$/i);
      if (areaMatch && areaMatch[1].trim()) {
        publishedServiceAreas.push(areaMatch[1].trim());
      }
    }

    const inferredState =
      publishedServiceAreas.length > 0
        ? inferSingleStateFromArea(publishedServiceAreas.join("; "))
        : null;

    const cardPlainExcerpt = decodeHtmlEntities(
      blockHtml
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    );

    const evidence: EvidenceReference[] = [
      {
        source_name: WESTONFENCE_SOURCE.name,
        source_url: WESTONFENCE_SOURCE.url,
        retrieved_at: retrievedAt,
        excerpt: `${directoryEvidenceExcerpt} — Listed installer: ${cardPlainExcerpt}`,
        supports: "rural_relevance",
      },
      {
        source_name: WESTONFENCE_SOURCE.name,
        source_url: WESTONFENCE_SOURCE.url,
        retrieved_at: retrievedAt,
        excerpt: directoryEvidenceExcerpt,
        supports: "specialty",
      },
    ];

    sightings.push({
      sighting_id: `westonfence:${i}`,
      source_id: WESTONFENCE_SOURCE.id,
      source_name: WESTONFENCE_SOURCE.name,
      source_url: WESTONFENCE_SOURCE.url,
      retrieved_at: retrievedAt,
      business_name: businessName,
      published_aliases: [],
      contact_names: contactNames,
      phones,
      public_email: publicEmail,
      had_protected_email_placeholder: hadProtectedPlaceholder,
      website_url: websiteUrl,
      social_links: socialLinks,
      // Westonfence only publishes "Area: <region>", not a verified base town
      raw_base_locality: null,
      raw_base_state: inferredState,
      raw_base_postcode: null,
      base_location_established: false,
      published_service_areas: publishedServiceAreas,
      explicit_fencing_services: [
        "Electric livestock fencing",
        "Invasive pest exclusion fencing",
      ],
      published_abn: null,
      evidence_references: evidence,
      website_check_notes: [],
      website_broken_or_parked: false,
    });
  }

  return sightings;
}
