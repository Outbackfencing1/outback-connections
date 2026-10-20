// scraper/normalise.ts
// Normalisation & validation utilities for phones, emails, business names,
// website URLs, and Australian (locality, state, 4-char postcode) tuples.

import type { AustralianState, PhoneRecord, PhoneType } from "./types.ts";
import type { SupplierArtifactBlocklist } from "./config.ts";

const VALID_STATES = new Set<AustralianState>([
  "NSW",
  "VIC",
  "QLD",
  "SA",
  "WA",
  "TAS",
  "NT",
  "ACT",
]);

/** Decode common HTML entities cleanly without stripping text. */
export function decodeHtmlEntities(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/&nbsp;|&#160;|&#xa0;/gi, " ")
    .replace(/&amp;|&#038;|&#38;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#039;|&#39;|&#8217;|&rsquo;|&#8216;|&lsquo;/gi, "'")
    .replace(/&#8211;|&ndash;/gi, "–")
    .replace(/&#8212;|&mdash;/gi, "—")
    .replace(/&#091;/g, "[")
    .replace(/&#093;/g, "]")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _;
    })
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise business name for comparison while preserving meaningful tokens. */
export function normaliseBusinessNameKey(name: string | null | undefined): string {
  if (!name) return "";
  return decodeHtmlEntities(name)
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(pty|proprietary|ltd|limited)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Format a 4-digit Australian postcode string, preserving leading zeroes (e.g. "0800"). */
export function formatPostcode4(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return s;
  // If numeric 3-digit NT postcode (e.g. 800 -> "0800") was passed as number in external input
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 800 && raw <= 999) {
    return String(raw).padStart(4, "0");
  }
  if (/^0\d{3}$/.test(s)) return s;
  return null;
}

/**
 * Normalise an Australian phone number without forcing landlines or 1300/1800
 * numbers into a mobile pattern.
 */
export function normaliseAustralianPhone(
  rawInput: string | null | undefined,
  options?: {
    contactName?: string | null;
    sourceUrl?: string;
    supplierBlocklist?: SupplierArtifactBlocklist;
  }
): PhoneRecord | null {
  if (!rawInput) return null;
  const raw = decodeHtmlEntities(rawInput).trim();
  if (!raw) return null;

  const hasPlus61 = /^\+?61/.test(raw.replace(/[\s()-]/g, ""));
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return null;

  let nationalDigits = digitsOnly;
  if (digitsOnly.startsWith("61") && digitsOnly.length === 11) {
    nationalDigits = "0" + digitsOnly.slice(2);
  } else if (hasPlus61 && digitsOnly.startsWith("61") && digitsOnly.length > 11) {
    return null;
  }

  // Check supplier blocklist
  const blocked = options?.supplierBlocklist?.supplierPhonesDigits ?? [];
  if (blocked.includes(nationalDigits) || blocked.includes(digitsOnly)) {
    return null;
  }

  let type: PhoneType = "unknown";
  let normalisedE164 = nationalDigits;

  if (/^04\d{8}$/.test(nationalDigits)) {
    type = "mobile";
    normalisedE164 = "+61" + nationalDigits.slice(1);
  } else if (/^0[2378]\d{8}$/.test(nationalDigits)) {
    type = "landline";
    normalisedE164 = "+61" + nationalDigits.slice(1);
  } else if (/^(1800\d{6}|1300\d{6}|13\d{4})$/.test(nationalDigits)) {
    type = "tollfree_or_1300";
    normalisedE164 = nationalDigits;
  } else {
    return null;
  }

  return {
    raw,
    normalised_e164: normalisedE164,
    national_digits: nationalDigits,
    type,
    contact_name: options?.contactName?.trim() || null,
    source_url: options?.sourceUrl || "",
  };
}

/**
 * Validate and extract a plain-text public email address.
 * Explicitly rejects protected-email placeholders (*protected email*, [email protected],
 * /cdn-cgi/l/email-protection, data-enc-email) and supplier emails.
 */
export function extractPublicEmail(
  rawTextOrHtml: string | null | undefined,
  supplierBlocklist?: SupplierArtifactBlocklist
): { email: string | null; hadProtectedPlaceholder: boolean } {
  if (!rawTextOrHtml) return { email: null, hadProtectedPlaceholder: false };

  const hadProtectedPlaceholder =
    /\*protected email\*|\[email[\s\u00a0]*protected\]|&#160;protected|\/cdn-cgi\/l\/email-protection|data-cfemail|data-enc-email/i.test(
      rawTextOrHtml
    );

  // Strip head, style, script/noscript, HTML comments, and protected anchor tags before looking for plain-text emails
  const cleaned = rawTextOrHtml
    .replace(/<head\b[\s\S]*?<\/head>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<a\b[^>]*data-enc-email[^>]*>[\s\S]*?<\/a>/gi, " ")
    .replace(/<a\b[^>]*__cf_email__[^>]*>[\s\S]*?<\/a>/gi, " ")
    .replace(/<a\b[^>]*email-protection[^>]*>[\s\S]*?<\/a>/gi, " ")
    .replace(/\*protected email\*/gi, " ")
    .replace(/\[email[\s\u00a0]*protected\]/gi, " ");

  const plainText = decodeHtmlEntities(cleaned.replace(/<[^>]+>/g, " "));
  const match = plainText.match(/\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/);
  if (!match) {
    return { email: null, hadProtectedPlaceholder };
  }

  const candidate = match[1].toLowerCase().trim();
  if (
    candidate.includes("example.com") ||
    candidate.includes("sentry.io") ||
    candidate.endsWith(".png") ||
    candidate.endsWith(".jpg")
  ) {
    return { email: null, hadProtectedPlaceholder };
  }

  if (supplierBlocklist) {
    if (supplierBlocklist.supplierEmailsLower.includes(candidate)) {
      return { email: null, hadProtectedPlaceholder };
    }
    const domain = candidate.split("@")[1] || "";
    if (supplierBlocklist.supplierDomainsLower.some((d) => domain === d || domain.endsWith("." + d))) {
      return { email: null, hadProtectedPlaceholder };
    }
  }

  return { email: candidate, hadProtectedPlaceholder };
}

/** Canonicalise an official website URL and reject supplier/social URLs as official websites. */
export function normaliseWebsiteUrl(
  rawUrl: string | null | undefined,
  supplierBlocklist?: SupplierArtifactBlocklist
): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed || /^javascript:/i.test(trimmed) || trimmed.startsWith("#")) return null;
  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || !host.includes(".")) return null;
    if (
      host.includes("facebook.com") ||
      host.includes("instagram.com") ||
      host.includes("linkedin.com") ||
      host.includes("google.com") ||
      host.includes("yellowpages.com.au")
    ) {
      return null;
    }
    if (
      supplierBlocklist?.supplierDomainsLower.some(
        (d) => host === d || host.endsWith("." + d)
      )
    ) {
      return null;
    }
    return `${parsed.protocol}//${parsed.hostname.toLowerCase()}${parsed.pathname === "/" ? "/" : parsed.pathname}`;
  } catch {
    return null;
  }
}

export function extractDomainKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Curated Australian locality -> (state, postcode) map covering rural & regional towns
 * (including multi-state ambiguous towns like Maryborough QLD 4650 vs VIC 3465,
 * Wellington NSW 2820 vs SA 5259, Enfield VIC 3352 vs NSW 2136 vs SA 5085, etc.).
 */
export const AUSTRALIAN_LOCALITY_POSTCODES: Record<
  string,
  { locality: string; state: AustralianState; postcode: string }[]
> = {
  armidale: [{ locality: "Armidale", state: "NSW", postcode: "2350" }],
  bathurst: [{ locality: "Bathurst", state: "NSW", postcode: "2795" }],
  bingara: [{ locality: "Bingara", state: "NSW", postcode: "2404" }],
  boorowa: [{ locality: "Boorowa", state: "NSW", postcode: "2586" }],
  boree: [{ locality: "Boree", state: "NSW", postcode: "2800" }],
  bungendore: [{ locality: "Bungendore", state: "NSW", postcode: "2621" }],
  carroll: [{ locality: "Carroll", state: "NSW", postcode: "2340" }],
  "clarence town": [{ locality: "Clarence Town", state: "NSW", postcode: "2321" }],
  clunes: [
    { locality: "Clunes", state: "VIC", postcode: "3370" },
    { locality: "Clunes", state: "NSW", postcode: "2480" },
  ],
  coolah: [{ locality: "Coolah", state: "NSW", postcode: "2843" }],
  cooma: [{ locality: "Cooma", state: "NSW", postcode: "2630" }],
  crookwell: [{ locality: "Crookwell", state: "NSW", postcode: "2583" }],
  darwin: [{ locality: "Darwin", state: "NT", postcode: "0800" }],
  delungra: [{ locality: "Delungra", state: "NSW", postcode: "2403" }],
  dubbo: [{ locality: "Dubbo", state: "NSW", postcode: "2830" }],
  dunedoo: [{ locality: "Dunedoo", state: "NSW", postcode: "2844" }],
  dunkeld: [{ locality: "Dunkeld", state: "VIC", postcode: "3294" }],
  echuca: [{ locality: "Echuca", state: "VIC", postcode: "3564" }],
  enfield: [
    { locality: "Enfield", state: "VIC", postcode: "3352" },
    { locality: "Enfield", state: "NSW", postcode: "2136" },
    { locality: "Enfield", state: "SA", postcode: "5085" },
  ],
  forbes: [{ locality: "Forbes", state: "NSW", postcode: "2871" }],
  galong: [{ locality: "Galong", state: "NSW", postcode: "2585" }],
  goulburn: [{ locality: "Goulburn", state: "NSW", postcode: "2580" }],
  gulgong: [{ locality: "Gulgong", state: "NSW", postcode: "2852" }],
  gundaroo: [{ locality: "Gundaroo", state: "NSW", postcode: "2620" }],
  heatherbrae: [{ locality: "Heatherbrae", state: "NSW", postcode: "2324" }],
  hillston: [{ locality: "Hillston", state: "NSW", postcode: "2675" }],
  hobart: [{ locality: "Hobart", state: "TAS", postcode: "7000" }],
  holbrook: [{ locality: "Holbrook", state: "NSW", postcode: "2644" }],
  horsham: [{ locality: "Horsham", state: "VIC", postcode: "3400" }],
  jamberoo: [{ locality: "Jamberoo", state: "NSW", postcode: "2533" }],
  "kains flat": [{ locality: "Kains Flat", state: "NSW", postcode: "2850" }],
  katherine: [{ locality: "Katherine", state: "NT", postcode: "0850" }],
  kellalac: [{ locality: "Kellalac", state: "VIC", postcode: "3393" }],
  macedon: [{ locality: "Macedon", state: "VIC", postcode: "3440" }],
  maryborough: [
    { locality: "Maryborough", state: "QLD", postcode: "4650" },
    { locality: "Maryborough", state: "VIC", postcode: "3465" },
  ],
  millmerran: [{ locality: "Millmerran", state: "QLD", postcode: "4357" }],
  molong: [{ locality: "Molong", state: "NSW", postcode: "2866" }],
  monkerai: [{ locality: "Monkerai", state: "NSW", postcode: "2415" }],
  mudgee: [{ locality: "Mudgee", state: "NSW", postcode: "2850" }],
  murringo: [{ locality: "Murringo", state: "NSW", postcode: "2586" }],
  murtoa: [{ locality: "Murtoa", state: "VIC", postcode: "3390" }],
  nericon: [{ locality: "Nericon", state: "NSW", postcode: "2680" }],
  nowra: [{ locality: "Nowra", state: "NSW", postcode: "2541" }],
  oberon: [{ locality: "Oberon", state: "NSW", postcode: "2787" }],
  orange: [{ locality: "Orange", state: "NSW", postcode: "2800" }],
  parkes: [{ locality: "Parkes", state: "NSW", postcode: "2870" }],
  queanbeyan: [{ locality: "Queanbeyan", state: "NSW", postcode: "2620" }],
  raleigh: [{ locality: "Raleigh", state: "NSW", postcode: "2454" }],
  richmond: [
    { locality: "Richmond", state: "NSW", postcode: "2753" },
    { locality: "Richmond", state: "VIC", postcode: "3121" },
    { locality: "Richmond", state: "QLD", postcode: "4822" },
    { locality: "Richmond", state: "TAS", postcode: "7025" },
  ],
  rupanyup: [{ locality: "Rupanyup", state: "VIC", postcode: "3388" }],
  rutherglen: [{ locality: "Rutherglen", state: "VIC", postcode: "3685" }],
  stawell: [{ locality: "Stawell", state: "VIC", postcode: "3380" }],
  sydney: [{ locality: "Sydney", state: "NSW", postcode: "2000" }],
  tamworth: [{ locality: "Tamworth", state: "NSW", postcode: "2340" }],
  tara: [{ locality: "Tara", state: "QLD", postcode: "4421" }],
  taree: [{ locality: "Taree", state: "NSW", postcode: "2430" }],
  toodyay: [{ locality: "Toodyay", state: "WA", postcode: "6566" }],
  "upper horton": [{ locality: "Upper Horton", state: "NSW", postcode: "2347" }],
  "wagga wagga": [{ locality: "Wagga Wagga", state: "NSW", postcode: "2650" }],
  wallalong: [{ locality: "Wallalong", state: "NSW", postcode: "2320" }],
  warrnambool: [{ locality: "Warrnambool", state: "VIC", postcode: "3280" }],
  wellington: [
    { locality: "Wellington", state: "NSW", postcode: "2820" },
    { locality: "Wellington", state: "SA", postcode: "5259" },
  ],
  whittingham: [{ locality: "Whittingham", state: "NSW", postcode: "2330" }],
  wodonga: [{ locality: "Wodonga", state: "VIC", postcode: "3690" }],
  "alice springs": [{ locality: "Alice Springs", state: "NT", postcode: "0870" }],
};

/**
 * Check if a 4-character postcode is plausible for an Australian state/territory,
 * accounting for known cross-border postcodes (e.g. 2620 NSW/ACT, 2611 NSW/ACT,
 * 2640 NSW/VIC, 4380 QLD/NSW, 0872 NT/SA/WA).
 */
export function isPostcodeCompatibleWithState(
  postcode4: string,
  state: AustralianState
): boolean {
  if (!/^\d{4}$/.test(postcode4)) return false;
  const n = Number.parseInt(postcode4, 10);

  // Known cross-border postcodes
  if (postcode4 === "2620" && (state === "NSW" || state === "ACT")) return true;
  if (postcode4 === "2618" && (state === "NSW" || state === "ACT")) return true;
  if (postcode4 === "2640" && (state === "NSW" || state === "VIC")) return true;
  if (postcode4 === "3644" && (state === "VIC" || state === "NSW")) return true;
  if (postcode4 === "4380" && (state === "QLD" || state === "NSW")) return true;
  if (postcode4 === "2406" && (state === "NSW" || state === "QLD")) return true;
  if (postcode4 === "0872" && (state === "NT" || state === "SA" || state === "WA")) return true;

  switch (state) {
    case "NSW":
      return (n >= 2000 && n <= 2599) || (n >= 2619 && n <= 2899) || (n >= 2921 && n <= 2999);
    case "ACT":
      return (n >= 2600 && n <= 2618) || (n >= 2900 && n <= 2920);
    case "VIC":
      return n >= 3000 && n <= 3999;
    case "QLD":
      return n >= 4000 && n <= 4999;
    case "SA":
      return n >= 5000 && n <= 5799;
    case "WA":
      return n >= 6000 && n <= 6797;
    case "TAS":
      return n >= 7000 && n <= 7799;
    case "NT":
      return n >= 800 && n <= 899;
    default:
      return false;
  }
}

export interface LocationValidationResult {
  locality: string | null;
  state: AustralianState | null;
  postcode: string | null;
  status:
    | "valid_confirmed"
    | "service_area_only_no_base_town"
    | "missing_location"
    | "ambiguous_locality"
    | "state_postcode_contradiction";
  notes: string | null;
}

/**
 * Validate (locality, state, postcode) together.
 * - Never guesses a postcode from an ambiguous town name without state.
 * - Flags state/postcode contradictions (including e.g. Queanbeyan with ACT instead of NSW).
 * - Preserves 4-character postcodes with leading zeroes.
 */
export function validateAndResolveLocation(input: {
  locality?: string | null;
  state?: string | null;
  postcode?: string | number | null;
  baseLocationEstablished?: boolean;
  hasPublishedServiceArea?: boolean;
}): LocationValidationResult {
  const rawLoc = decodeHtmlEntities(input.locality).trim() || null;
  const rawStateUpper = decodeHtmlEntities(input.state).toUpperCase().trim();
  const state = VALID_STATES.has(rawStateUpper as AustralianState)
    ? (rawStateUpper as AustralianState)
    : null;
  const pc4 = formatPostcode4(input.postcode);

  if (
    input.baseLocationEstablished === false &&
    !rawLoc &&
    !pc4 &&
    (state || input.hasPublishedServiceArea)
  ) {
    return {
      locality: null,
      state,
      postcode: null,
      status: "service_area_only_no_base_town",
      notes: "Source publishes regional service area only; no specific base town established.",
    };
  }

  if (!rawLoc && !state && !pc4) {
    return {
      locality: null,
      state: null,
      postcode: null,
      status: "missing_location",
      notes: "No base locality, state, postcode, or service area published on source.",
    };
  }

  const locKey = rawLoc ? rawLoc.toLowerCase().replace(/\s+/g, " ").trim() : null;
  const knownEntries = locKey ? AUSTRALIAN_LOCALITY_POSTCODES[locKey] ?? null : null;

  // Case 1: Locality is known in our reference dictionary
  if (knownEntries && knownEntries.length > 0) {
    if (!state && !pc4) {
      if (knownEntries.length > 1) {
        return {
          locality: rawLoc,
          state: null,
          postcode: null,
          status: "ambiguous_locality",
          notes: `Locality "${rawLoc}" exists in multiple states (${knownEntries
            .map((e) => `${e.state} ${e.postcode}`)
            .join(", ")}); cannot assign postcode without state.`,
        };
      }
      // Even when unique in dictionary, if no state was published at all, be conservative
      return {
        locality: knownEntries[0].locality,
        state: knownEntries[0].state,
        postcode: knownEntries[0].postcode,
        status: "valid_confirmed",
        notes: null,
      };
    }

    if (state) {
      const stateMatch = knownEntries.find((e) => e.state === state);
      if (!stateMatch) {
        return {
          locality: rawLoc,
          state,
          postcode: pc4,
          status: "state_postcode_contradiction",
          notes: `Locality "${rawLoc}" is in ${knownEntries
            .map((e) => `${e.state} (${e.postcode})`)
            .join("/")}, contradicting state "${state}".`,
        };
      }
      if (pc4 && pc4 !== stateMatch.postcode) {
        return {
          locality: stateMatch.locality,
          state,
          postcode: pc4,
          status: "state_postcode_contradiction",
          notes: `Postcode "${pc4}" contradicts known postcode "${stateMatch.postcode}" for ${stateMatch.locality}, ${state}.`,
        };
      }
      return {
        locality: stateMatch.locality,
        state: stateMatch.state,
        postcode: stateMatch.postcode,
        status: "valid_confirmed",
        notes: null,
      };
    }
  }

  // Case 2: Both state and postcode provided (with or without known dictionary entry)
  if (state && pc4) {
    if (!isPostcodeCompatibleWithState(pc4, state)) {
      return {
        locality: rawLoc,
        state,
        postcode: pc4,
        status: "state_postcode_contradiction",
        notes: `Postcode "${pc4}" is outside the valid postcode range for state "${state}".`,
      };
    }
    return {
      locality: rawLoc,
      state,
      postcode: pc4,
      status: "valid_confirmed",
      notes: null,
    };
  }

  // Case 3: Locality provided (not in dictionary) without confirmed postcode
  return {
    locality: rawLoc,
    state,
    postcode: pc4,
    status: "ambiguous_locality",
    notes: `Locality "${rawLoc ?? "(none)"}" (${state ?? "no state"}) has no verified 4-digit postcode mapping.`,
  };
}
