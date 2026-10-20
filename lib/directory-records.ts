// lib/directory-records.ts
// ONE definition of "a staff-entered directory entry": validation + the
// ImportRecord it becomes. Used by the quick-add server action, the CSV
// loader on the bulk import page, and the tests. Pure: no server imports.
import {
  buildSearchUrl,
  directoryExternalId,
  isSourcePlatform,
  SOURCE_PLATFORM_OPTIONS,
  type SourcePlatform,
  type SourceUrlKind,
} from "./source-platforms";
import { isRuralPostcode } from "./rural-postcodes";

export const DIRECTORY_VERTICALS = ["service", "job", "freight"] as const;
export type DirectoryVertical = (typeof DIRECTORY_VERTICALS)[number];
export const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"] as const;

/** Raw input, as strings (form fields or CSV cells). Empty string = not given. */
export type DirectoryEntryInput = {
  name: string;
  vertical: string;
  category_slug?: string;
  postcode: string;
  suburb?: string;
  state?: string;
  /** Optional verified rural postcode(s) serviced when a provider's office is in a metro area or covers multiple towns. */
  service_postcode?: string;
  service_suburb?: string;
  platform: string;
  source_url?: string;
  website?: string;
  phone?: string;
  email?: string;
  notes?: string;
};

export type DirectoryImportRecord = {
  vertical: DirectoryVertical;
  source_platform: SourcePlatform;
  source_external_id: string;
  source_url: string;
  name: string;
  postcode: string;
  category_slug: string | null;
  suburb: string | null;
  state: string | null;
  website: string | null;
  raw_payload: Record<string, unknown>;
};

export type BuildResult =
  | { ok: true; record: DirectoryImportRecord; urlKind: SourceUrlKind }
  | { ok: false; errors: Record<string, string> };

const PLATFORM_ALIASES: Record<string, SourcePlatform> = {
  facebook: "facebook",
  fb: "facebook",
  "facebook page": "facebook",
  yellow_pages: "yellow_pages",
  "yellow pages": "yellow_pages",
  "public directory": "yellow_pages",
  "yellow pages / public directory": "yellow_pages",
  yellowpages: "yellow_pages",
  yp: "yellow_pages",
  truelocal: "truelocal",
  "true local": "truelocal",
  google_maps: "google_maps",
  "google maps": "google_maps",
  google: "google_maps",
  maps: "google_maps",
  official_website: "official_website",
  "official website": "official_website",
  "the business's own website": "official_website",
  website: "official_website",
  "own website": "official_website",
  site: "official_website",
  web: "web",
  online: "web",
  other: "web",
  internet: "web",
  "somewhere else online": "web",
  "supplier directory": "web",
  "installer directory": "web",
  rotech: "web",
  westonfence: "web",
};

const NON_RURAL_FENCING_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bpool\s+fenc/i, label: "pool fencing" },
  { pattern: /\bglass\s+fenc/i, label: "glass fencing" },
  { pattern: /\bcolorbond\s+only\b/i, label: "residential Colorbond-only fencing" },
  { pattern: /\bhandrail/i, label: "handrails" },
  { pattern: /\bbalustrade/i, label: "balustrades" },
  { pattern: /\btemp(orary)?\s+(fenc|barricade|hire)/i, label: "temporary event/site fencing or barricades" },
  { pattern: /\bbarricade/i, label: "barricades" },
];

const CATEGORY_KEYWORD_SUGGESTIONS: Array<{ pattern: RegExp; slug: string; label: string }> = [
  { pattern: /\b(bore|windmill|water\s+pump|drilling|irrigation\s+pump)\b/i, slug: "water-bores", label: "Bore / pump / water" },
  { pattern: /\b(diesel\s+mechanic|mobile\s+mechanic|heavy\s+vehicle\s+mechanic)\b/i, slug: "mechanic", label: "Mobile diesel mechanic" },
  { pattern: /\b(tractor\s+repair|header\s+repair|ag\s+machinery\s+repair|machinery\s+service)\b/i, slug: "machinery-repair", label: "Agricultural machinery repair" },
  { pattern: /\b(plumber|plumbing|septic|water\s+tank\s+plumb)\b/i, slug: "rural-plumber", label: "Rural plumbing" },
  { pattern: /\b(electrician|electrical|solar\s+pump\s+elec)\b/i, slug: "rural-electrician", label: "Rural electrical" },
  { pattern: /\b(shearing|crutching|wool\s+class)\b/i, slug: "shearing-crutching", label: "Shearing & crutching" },
  { pattern: /\b(earthmov|dam\s+sinking|dozer|grader|excavation|clearing)\b/i, slug: "earthworks", label: "Earthworks (dams, roads, clearing)" },
  { pattern: /\b(spraying|boom\s+spray|broadacre\s+crop|seeding|windrowing)\b/i, slug: "contract-cropping", label: "Contract cropping & harvesting" },
  { pattern: /\b(livestock\s+carrier|cattle\s+transport|sheep\s+transport|stock\s+crate)\b/i, slug: "livestock-carriers", label: "Livestock carriers" },
];

export type HubCandidateAssessment = {
  /** Decision 1: Does the entry belong in the rural hub and its particular category? */
  hubBelongs: boolean;
  suggestedCategorySlug: string | null;
  categoryWarning: string | null;
  /** Decision 2: Is its evidence sufficient for publication in the correct source/ownership state? */
  evidenceSufficient: boolean;
  missingEvidence: string[];
  /** Decision 3: Separate, optional Outback product opportunity (never required for hub inclusion). */
  productOpportunity: "fencing_trade" | "rural_store_supply" | "none";
};

/**
 * Evaluates a candidate using the three independent audit decisions:
 * 1. Does it belong in the rural hub and its category?
 * 2. Is its evidence sufficient for publication?
 * 3. Is there a separate Outback product opportunity? (A "none" here never rejects a valid hub listing.)
 */
export function classifyRuralHubCandidate(input: {
  name: string;
  vertical?: string | null;
  categorySlug?: string | null;
  postcode?: string | null;
  servicePostcode?: string | null;
  state?: string | null;
  platform?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
}): HubCandidateAssessment {
  const name = (input.name ?? "").trim();
  const notes = (input.notes ?? "").trim();
  const cat = (input.categorySlug ?? "").trim().toLowerCase();
  const hay = `${name} ${notes}`;

  let suggestedCategorySlug: string | null = cat || null;
  for (const rule of CATEGORY_KEYWORD_SUGGESTIONS) {
    if (rule.pattern.test(hay)) {
      suggestedCategorySlug = rule.slug;
      break;
    }
  }

  const fencingMismatch = detectNonRuralFencingWarning(name, notes, cat || "fencing-contractor");
  const categoryWarning =
    fencingMismatch ||
    (cat === "fencing-contractor" &&
    suggestedCategorySlug &&
    suggestedCategorySlug !== "fencing-contractor"
      ? `"${name}" looks like ${suggestedCategorySlug} rather than fencing-contractor.`
      : null);

  const hubBelongs = !fencingMismatch && name.length >= 2;

  const missingEvidence: string[] = [];
  if (name.length < 2) missingEvidence.push("business_name");
  const pc = (input.postcode ?? "").trim();
  const spc = (input.servicePostcode ?? "").trim();
  const st = (input.state ?? "NSW").trim().toUpperCase();
  if (!isRuralPostcode(pc, st) && !isRuralPostcode(spc, st)) {
    missingEvidence.push("verified_rural_postcode_or_service_area");
  }
  const normPlat = normalisePlatform(input.platform);
  if (!normPlat) {
    missingEvidence.push("approved_source_platform");
  }

  const effectiveCat = cat || suggestedCategorySlug || "";
  const productOpportunity: HubCandidateAssessment["productOpportunity"] =
    effectiveCat === "fencing-contractor" || effectiveCat === "fencing-labour"
      ? "fencing_trade"
      : effectiveCat === "rural-supplies"
        ? "rural_store_supply"
        : "none";

  return {
    hubBelongs,
    suggestedCategorySlug,
    categoryWarning,
    evidenceSufficient: hubBelongs && missingEvidence.length === 0,
    missingEvidence,
    productOpportunity,
  };
}

/**
 * Flags obvious suburban / non-rural fencing businesses (pool fencing, handrails,
 * temporary barricades) before they are added under rural fencing contractors.
 */
export function detectNonRuralFencingWarning(
  name: string,
  notes?: string | null,
  categorySlug?: string | null
): string | null {
  const cat = (categorySlug ?? "fencing-contractor").trim().toLowerCase();
  if (cat && cat !== "fencing-contractor") return null;
  const hay = `${name} ${notes ?? ""}`;
  for (const item of NON_RURAL_FENCING_PATTERNS) {
    if (item.pattern.test(hay)) {
      return `Heads up: "${name}" mentions ${item.label}. Only use fencing-contractor for genuine rural, farm, stock, exclusion, or acreage fencing.`;
    }
  }
  return null;
}

/** Accepts the platform value, its label, or common shorthand. */
export function normalisePlatform(v: string | undefined | null): SourcePlatform | null {
  const key = (v ?? "").trim().toLowerCase();
  if (!key) return null;
  if (isSourcePlatform(key)) return key;
  return PLATFORM_ALIASES[key] ?? null;
}

function isHttpUrl(v: string): boolean {
  return /^https?:[/][/][^ ]+$/i.test(v);
}

const t = (v: string | undefined | null): string => (v ?? "").trim();

export function buildDirectoryRecord(
  input: DirectoryEntryInput,
  meta: { enteredBy: string; enteredVia: string; enteredAt?: string }
): BuildResult {
  const errors: Record<string, string> = {};
  const name = t(input.name);
  const vertical = t(input.vertical).toLowerCase() as DirectoryVertical;
  const categorySlug = t(input.category_slug);
  const postcodeInput = t(input.postcode);
  const suburbInput = t(input.suburb);
  const servicePostcode = t(input.service_postcode);
  const serviceSuburb = t(input.service_suburb);
  const state = t(input.state).toUpperCase();
  const effectiveState = state || "NSW";
  const platform = normalisePlatform(input.platform);
  const url = t(input.source_url);
  const website = t(input.website);
  const phone = t(input.phone);
  const email = t(input.email);
  const notesInput = t(input.notes);

  let postcode = postcodeInput;
  let suburb = suburbInput;
  let usedServiceAreaOverride = false;

  if (name.length < 2 || name.length > 120) errors.name = "Business name: 2 to 120 characters.";
  if (!DIRECTORY_VERTICALS.includes(vertical)) errors.vertical = "Pick which directory it belongs in.";
  if (!/^[0-9]{4}$/.test(postcodeInput)) {
    errors.postcode = "Postcode: 4 digits.";
  } else if (!isRuralPostcode(postcodeInput, effectiveState)) {
    if (servicePostcode) {
      if (!/^[0-9]{4}$/.test(servicePostcode)) {
        errors.service_postcode = "Primary rural service postcode: 4 digits.";
      } else if (!isRuralPostcode(servicePostcode, effectiveState)) {
        errors.service_postcode =
          "Primary rural service postcode must be a regional/rural postcode (not metro).";
      } else {
        postcode = servicePostcode;
        suburb = serviceSuburb || suburbInput;
        usedServiceAreaOverride = true;
      }
    } else {
      errors.postcode =
        "Metro postcode excluded — rural and regional postcodes only. If this business is based in a metro area but genuinely services rural properties, enter their verified Primary Rural Service Postcode below (office address stays preserved separately).";
    }
  } else if (servicePostcode) {
    if (!/^[0-9]{4}$/.test(servicePostcode)) {
      errors.service_postcode = "Primary rural service postcode: 4 digits.";
    } else if (!isRuralPostcode(servicePostcode, effectiveState)) {
      errors.service_postcode =
        "Primary rural service postcode must be a regional/rural postcode (not metro).";
    }
  }
  if (suburb.length > 80) errors.suburb = "Town or area: under 80 characters.";
  if (state && !(AU_STATES as readonly string[]).includes(state)) errors.state = "Pick a state.";
  if (!platform) errors.platform = "Tell us where you found it.";
  const opt = platform ? SOURCE_PLATFORM_OPTIONS.find((o) => o.value === platform) : undefined;
  if (url && !isHttpUrl(url)) errors.source_url = "Paste a full URL starting with http:// or https://.";
  if (opt?.needsUrl && !url) errors.source_url = `${opt.label}: paste the page URL.`;
  if (website && !isHttpUrl(website)) errors.website = "Website must start with http:// or https://.";
  if (email && !/^[^@ ]+@[^@ ]+[.][^@ ]+$/.test(email)) errors.email = "That email doesn't look right.";
  if (phone && !/^[0-9 ()+-]{6,20}$/.test(phone)) errors.phone = "Phone: digits, spaces and brackets only.";
  if (notesInput.length > 2000) errors.notes = "Notes: keep under 2000 characters.";
  if (Object.keys(errors).length > 0 || !platform) return { ok: false, errors };

  const notes = usedServiceAreaOverride
    ? [
        notesInput,
        `Base office postcode: ${postcodeInput}${suburbInput ? ` (${suburbInput})` : ""}; verified rural service area: ${postcode}${suburb ? ` (${suburb})` : ""}.`,
      ]
        .filter(Boolean)
        .join(" — ")
    : servicePostcode
      ? [
          notesInput,
          `Also services rural area: ${servicePostcode}${serviceSuburb ? ` (${serviceSuburb})` : ""}.`,
        ]
          .filter(Boolean)
          .join(" — ")
      : notesInput;

  const urlKind: SourceUrlKind = url ? "site" : "search";
  const sourceUrl = url || buildSearchUrl(platform, name, postcode, effectiveState);
  const site = website || (platform === "official_website" ? url : "");

  const record: DirectoryImportRecord = {
    vertical,
    source_platform: platform,
    source_external_id: directoryExternalId(platform, name, postcode),
    source_url: sourceUrl,
    name,
    postcode,
    category_slug: categorySlug || null,
    suburb: suburb || null,
    state: state || null,
    website: site || null,
    // Private. Phone/email never reach the public contact columns.
    // Office address and verified service areas are preserved separately.
    raw_payload: {
      type: categorySlug || null,
      phone: phone || null,
      email: email || null,
      notes: notes || null,
      office_postcode: postcodeInput,
      office_suburb: suburbInput || null,
      ...(usedServiceAreaOverride
        ? {
            service_postcode: postcode,
            service_suburb: serviceSuburb || null,
            service_area_postcodes: [postcode],
            location_basis: "service_area_verified_metro_office",
          }
        : servicePostcode
          ? {
              service_postcode: servicePostcode,
              service_suburb: serviceSuburb || null,
              service_area_postcodes: [postcodeInput, servicePostcode],
              location_basis: "rural_base_with_additional_service_area",
            }
          : {
              service_area_postcodes: [postcodeInput],
              location_basis: "rural_base_address",
            }),
      found_on: platform,
      source_url_kind: urlKind,
      entered_by: meta.enteredBy,
      entered_via: meta.enteredVia,
      entered_at: meta.enteredAt ?? new Date().toISOString(),
    },
  };
  return { ok: true, record, urlKind };
}

const COLUMN_ALIASES: Record<keyof DirectoryEntryInput, string[]> = {
  name: ["name", "business", "business_name", "company", "trading_name"],
  vertical: ["vertical", "directory", "type"],
  category_slug: ["category", "category_slug", "cat"],
  postcode: ["postcode", "post_code", "pc"],
  suburb: ["suburb", "town", "area", "locality", "town_area"],
  state: ["state"],
  service_postcode: ["service_postcode", "rural_postcode", "service_area_postcode", "primary_rural_postcode"],
  service_suburb: ["service_suburb", "rural_suburb", "service_town", "service_area"],
  platform: ["platform", "found_on", "source", "found", "source_platform", "where_found"],
  source_url: ["source_url", "url", "page_url", "link", "page", "listing_url"],
  website: ["website", "web", "site", "www"],
  phone: ["phone", "mobile", "tel", "telephone", "contact_phone"],
  email: ["email", "e_mail", "contact_email"],
  notes: ["notes", "note", "comments", "comment"],
};

/** Maps a spreadsheet row (snake_case headers) onto the entry input. */
export function csvRowToInput(row: Record<string, string>, defaults?: Partial<DirectoryEntryInput>): DirectoryEntryInput {
  const pick = (key: keyof DirectoryEntryInput): string => {
    for (const alias of COLUMN_ALIASES[key]) {
      const v = row[alias];
      if (v !== undefined && v !== "") return v;
    }
    return defaults?.[key] ?? "";
  };
  return {
    name: pick("name"),
    vertical: pick("vertical") || "service",
    category_slug: pick("category_slug"),
    postcode: pick("postcode"),
    suburb: pick("suburb"),
    state: pick("state"),
    service_postcode: pick("service_postcode"),
    service_suburb: pick("service_suburb"),
    platform: pick("platform"),
    source_url: pick("source_url"),
    website: pick("website"),
    phone: pick("phone"),
    email: pick("email"),
    notes: pick("notes"),
  };
}
