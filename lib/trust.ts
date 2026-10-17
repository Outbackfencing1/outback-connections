// lib/trust.ts — Pure helpers and constants for Vendor / Worker / Farmer Trust,
// ABN validation, structured feedback tags, insurance badges, and deal types.

export const TRUST_TAGS = [
  { slug: "turned_up_on_time", label: "Turned up on time", side: "vendor" },
  { slug: "accurate_description", label: "Stock / hay / gear as described", side: "vendor" },
  { slug: "good_gear_well_maintained", label: "Good gear & well maintained", side: "vendor" },
  { slug: "fair_price", label: "Fair price & honest weights", side: "vendor" },
  { slug: "quality_fencing", label: "Quality workmanship", side: "vendor" },
  { slug: "safe_operator", label: "Safe around stock & machinery", side: "vendor" },
  { slug: "great_communication", label: "Easy to deal with", side: "both" },
  { slug: "prompt_payment", label: "Paid on time", side: "customer" },
  { slug: "clear_instructions", label: "Clear instructions & job brief", side: "customer" },
  { slug: "good_site_access", label: "Good paddock & truck access", side: "customer" },
  { slug: "good_quarters_tucker", label: "Good quarters / camp & conditions", side: "customer" },
  { slug: "fair_property_boss", label: "Fair property / boss to work for", side: "customer" },
] as const;

export const VENDOR_QUICK_VOUCH_TAGS = [
  { slug: "turned_up_on_time", label: "Turned up on time" },
  { slug: "quality_fencing", label: "Quality workmanship" },
  { slug: "accurate_description", label: "As described" },
  { slug: "great_communication", label: "Easy to deal with" },
] as const;

export const CUSTOMER_QUICK_VOUCH_TAGS = [
  { slug: "prompt_payment", label: "Paid on time" },
  { slug: "clear_instructions", label: "Clear instructions" },
  { slug: "good_site_access", label: "Good paddock / truck access" },
  { slug: "fair_property_boss", label: "Good property to work for" },
] as const;

export type TrustTagSlug = (typeof TRUST_TAGS)[number]["slug"];

const TRUST_TAG_MAP = new Map<string, string>(
  TRUST_TAGS.map((t) => [t.slug, t.label])
);

export function isValidTrustTag(slug: string): slug is TrustTagSlug {
  return TRUST_TAG_MAP.has(slug);
}

export function trustTagLabel(slug: string): string {
  return TRUST_TAG_MAP.get(slug) ?? slug;
}

export const DEAL_TYPES = [
  { slug: "fencing_service", label: "Used for fencing or rural contracting" },
  { slug: "hired_worker", label: "Hired for farm / contracting work" },
  { slug: "worked_for", label: "Worked for this property / customer / employer" },
  { slug: "bought_item", label: "Bought livestock, hay, grain or gear" },
  { slug: "sold_item", label: "Sold to this customer / buyer" },
  { slug: "freight_load", label: "Moved freight / backload together" },
  { slug: "general", label: "General rural dealing / vouch" },
] as const;

export type DealTypeSlug = (typeof DEAL_TYPES)[number]["slug"];

const DEAL_TYPE_MAP = new Map<string, string>(
  DEAL_TYPES.map((d) => [d.slug, d.label])
);

export function isValidDealType(slug: string): slug is DealTypeSlug {
  return DEAL_TYPE_MAP.has(slug);
}

export function dealTypeLabel(slug: string): string {
  return DEAL_TYPE_MAP.get(slug) ?? "Verified dealing";
}

export const INSURANCE_BADGES = [
  { slug: "public_liability", label: "Public Liability Insured" },
  { slug: "workers_comp", label: "Workers Comp Covered" },
  { slug: "transit_marine", label: "Transit / Livestock Cargo Insured" },
  { slug: "nhvr_compliant", label: "NHVR Heavy Vehicle Compliant" },
] as const;

export type InsuranceBadgeSlug = (typeof INSURANCE_BADGES)[number]["slug"];

const INSURANCE_MAP = new Map<string, string>(
  INSURANCE_BADGES.map((b) => [b.slug, b.label])
);

export function isValidInsuranceBadge(slug: string): slug is InsuranceBadgeSlug {
  return INSURANCE_MAP.has(slug);
}

export function insuranceBadgeLabel(slug: string): string {
  return INSURANCE_MAP.get(slug) ?? slug;
}

export const ROLE_TAGS = [
  { slug: "fencing_contractor", label: "Fencing Contractor" },
  { slug: "truck_driver_carrier", label: "Truck Driver / Carrier" },
  { slug: "machine_header_operator", label: "Header / Machine / Ag Contracting" },
  { slug: "earthmoving_dam_contractor", label: "Earthmoving & Dam Contractor" },
  { slug: "station_hand_shearer", label: "Shearer / Crutching / Station Hand" },
  { slug: "bore_water_driller", label: "Bore Driller & Water Systems" },
  { slug: "farmer_grazier", label: "Farmer / Grazier / Property" },
  { slug: "hay_grain_grower", label: "Hay & Grain Grower" },
  { slug: "machinery_steel_supplier", label: "Machinery & Rural Supplier" },
] as const;

export type RoleTagSlug = (typeof ROLE_TAGS)[number]["slug"];

const ROLE_TAG_MAP = new Map<string, string>(
  ROLE_TAGS.map((r) => [r.slug, r.label])
);

export function isValidRoleTag(slug: string): slug is RoleTagSlug {
  return ROLE_TAG_MAP.has(slug);
}

export function roleTagLabel(slug: string): string {
  return ROLE_TAG_MAP.get(slug) ?? slug;
}

/**
 * Validates an 11-digit Australian Business Number (ABN) using the official
 * ATO modulus-89 algorithm:
 * 1. Subtract 1 from the first (leftmost) digit.
 * 2. Multiply each digit by its weighting factor: [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19].
 * 3. Sum the products; valid iff sum % 89 === 0.
 */
export function isValidAustralianAbn(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\s+/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number(digits[i]);
    const adjusted = i === 0 ? d - 1 : d;
    sum += adjusted * weights[i];
  }
  return sum > 0 && sum % 89 === 0;
}

export function normaliseAbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\s+/g, "");
  return isValidAustralianAbn(digits) ? digits : null;
}

export function formatAbn(raw: string | null | undefined): string | null {
  const digits = normaliseAbn(raw);
  if (!digits) return null;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 11)}`;
}

export const AVAILABILITY_STATUSES = [
  {
    slug: "available",
    label: "Available for work / bookings now",
    shortLabel: "Available now",
    dotClass: "bg-emerald-500",
    badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-950",
  },
  {
    slug: "available_soon",
    label: "Available soon / taking bookings",
    shortLabel: "Available soon",
    dotClass: "bg-amber-500",
    badgeClass: "border-amber-300 bg-amber-50 text-amber-950",
  },
  {
    slug: "booked_out",
    label: "Currently booked out",
    shortLabel: "Booked out",
    dotClass: "bg-neutral-400",
    badgeClass: "border-neutral-300 bg-neutral-100 text-neutral-700",
  },
] as const;

export type AvailabilityStatusSlug = (typeof AVAILABILITY_STATUSES)[number]["slug"];

export function isValidAvailabilityStatus(slug: string): slug is AvailabilityStatusSlug {
  return AVAILABILITY_STATUSES.some((s) => s.slug === slug);
}

export function availabilityStatusInfo(slug: string | null | undefined) {
  return (
    AVAILABILITY_STATUSES.find((s) => s.slug === slug) ?? AVAILABILITY_STATUSES[0]
  );
}

export function isCustomerTrustTag(slug: string): boolean {
  const found = TRUST_TAGS.find((t) => t.slug === slug);
  return found?.side === "customer";
}

export function formatPhoneHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length >= 6 ? cleaned : null;
}

export function isAustralianMobile(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/\s+/g, "");
  return /^(\+?614|04)\d{8}$/.test(cleaned);
}

/**
 * Normalise an Australian phone number to canonical digits (e.g. "0428638699"
 * or "0268845888") so "+61 428 638 699" and "0428 638 699" match reliably.
 */
export function normalisePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("61") && digits.length === 11) {
    digits = "0" + digits.slice(2);
  }
  return digits;
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.com.au",
  "hotmail.com",
  "hotmail.com.au",
  "live.com",
  "live.com.au",
  "yahoo.com",
  "yahoo.com.au",
  "icloud.com",
  "me.com",
  "bigpond.com",
  "bigpond.net.au",
  "optusnet.com.au",
  "telstra.com",
  "proton.me",
  "protonmail.com",
]);

export function extractBusinessDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  let host = "";
  if (trimmed.includes("@")) {
    host = trimmed.split("@").pop() ?? "";
  } else {
    try {
      const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      host = url.hostname.toLowerCase();
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "");
  if (!host || !host.includes(".") || FREE_EMAIL_DOMAINS.has(host)) {
    return null;
  }
  return host;
}

export type ClaimVerificationDecision = {
  autoApprove: boolean;
  method: "email_domain" | "abn_match" | "phone_otp" | "admin_approval";
  reason: string;
  phoneMatchesFile: boolean;
  emailMatchesFile: boolean;
  domainMatchesFile: boolean;
};

/**
 * Evaluates whether a business claim can be auto-approved immediately based on
 * objective proof (matching business email, matching website domain, matching
 * ABN on file, or active ABR entity/phone match), or queued for admin review.
 */
export function evaluateClaimAutoVerification(params: {
  claimantEmail: string | null | undefined;
  businessEmail: string | null | undefined;
  businessWebsite: string | null | undefined;
  businessPhone: string | null | undefined;
  businessAbn: string | null | undefined;
  businessName: string | null | undefined;
  submittedPhone?: string | null;
  submittedAbn?: string | null;
  abrEntityName?: string | null;
  abrIsActive?: boolean;
}): ClaimVerificationDecision {
  const userEmail = (params.claimantEmail ?? "").trim().toLowerCase();
  const bizEmail = (params.businessEmail ?? "").trim().toLowerCase();

  const emailMatchesFile = Boolean(userEmail && bizEmail && userEmail === bizEmail);

  const userDomain = extractBusinessDomain(userEmail);
  const bizEmailDomain = extractBusinessDomain(bizEmail);
  const bizWebDomain = extractBusinessDomain(params.businessWebsite);
  const domainMatchesFile = Boolean(
    userDomain && (userDomain === bizEmailDomain || userDomain === bizWebDomain)
  );

  const bizPhoneDigits = normalisePhoneDigits(params.businessPhone);
  const subPhoneDigits = normalisePhoneDigits(params.submittedPhone);
  const phoneMatchesFile = Boolean(
    bizPhoneDigits.length >= 8 && subPhoneDigits === bizPhoneDigits
  );

  const cleanSubmittedAbn = normaliseAbn(params.submittedAbn);
  const cleanBizAbn = normaliseAbn(params.businessAbn);

  // 1. Exact business email or custom business domain match
  if (emailMatchesFile) {
    return {
      autoApprove: true,
      method: "email_domain",
      reason: "Signed-in email matches the business email on file.",
      phoneMatchesFile,
      emailMatchesFile,
      domainMatchesFile,
    };
  }

  if (domainMatchesFile) {
    return {
      autoApprove: true,
      method: "email_domain",
      reason: `Signed-in email domain (@${userDomain}) matches the business website/domain.`,
      phoneMatchesFile,
      emailMatchesFile,
      domainMatchesFile,
    };
  }

  // 2. Submitted valid ABN matches ABN already recorded on the business
  if (cleanSubmittedAbn && cleanBizAbn && cleanSubmittedAbn === cleanBizAbn) {
    return {
      autoApprove: true,
      method: "abn_match",
      reason: "Submitted ABN matches the business ABN on file.",
      phoneMatchesFile,
      emailMatchesFile,
      domainMatchesFile,
    };
  }

  // 3. Submitted valid ABN + ABR entity name shares a significant word with business name
  if (cleanSubmittedAbn && params.abrIsActive && params.abrEntityName && params.businessName) {
    const stopWords = new Set([
      "pty",
      "ltd",
      "limited",
      "the",
      "and",
      "nsw",
      "australia",
      "rural",
      "contracting",
      "contractor",
      "fencing",
      "transport",
      "services",
      "trust",
      "family",
    ]);
    const bizWords = params.businessName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));
    const abrLower = params.abrEntityName.toLowerCase();
    const nameOverlap = bizWords.some((w) => abrLower.includes(w));
    if (nameOverlap) {
      return {
        autoApprove: true,
        method: "abn_match",
        reason: `Active ABR entity (${params.abrEntityName}) matches business name.`,
        phoneMatchesFile,
        emailMatchesFile,
        domainMatchesFile,
      };
    }
  }

  // 4. Submitted valid ABN + exact business phone match on file
  if (cleanSubmittedAbn && phoneMatchesFile && params.abrIsActive !== false) {
    return {
      autoApprove: true,
      method: "abn_match",
      reason: "Valid 11-digit ABN combined with matching registered business phone number.",
      phoneMatchesFile,
      emailMatchesFile,
      domainMatchesFile,
    };
  }

  return {
    autoApprove: false,
    method: "admin_approval",
    reason: phoneMatchesFile
      ? "Phone number matches business on file — queued for quick admin confirmation."
      : "Queued for admin verification.",
    phoneMatchesFile,
    emailMatchesFile,
    domainMatchesFile,
  };
}

export type VendorReviewRow = {
  id: string;
  created_at: string;
  reviewer_display_name: string;
  reviewer_postcode: string | null;
  rating: number;
  would_recommend: boolean;
  deal_type: string;
  tags: string[];
  comment: string | null;
  vendor_reply: string | null;
  vendor_replied_at: string | null;
};

export type VendorTrustSummary = {
  user_id: string | null;
  business_id: string | null;
  display_name: string | null;
  trading_name: string | null;
  bio: string | null;
  suburb?: string | null;
  postcode: string | null;
  state: string | null;
  member_since: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  abn_verified: boolean;
  abn: string | null;
  abn_entity_name: string | null;
  claim_status: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  facebook_url?: string | null;
  services_offered?: string[];
  photo_urls?: string[];
  insurances_held: string[];
  role_tags: string[];
  years_in_district: number | null;
  availability_status?: string | null;
  outback_verified?: boolean;
  active_listings_count: number;
  completed_deals_count: number;
  enquiry_forwarded: number;
  enquiry_answered: number;
  enquiry_responded: number;
  review_count: number;
  avg_rating: number | null;
  recommend_pct: number | null;
  top_tags: Array<{ tag: string; count: number }>;
  recent_reviews: VendorReviewRow[];
};


