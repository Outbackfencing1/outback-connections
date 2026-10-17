// lib/trust.ts — Pure helpers and constants for Vendor / Worker / Farmer Trust,
// ABN validation, structured feedback tags, insurance badges, and deal types.

export const TRUST_TAGS = [
  { slug: "turned_up_on_time", label: "Turned up on time" },
  { slug: "accurate_description", label: "Stock / hay / gear as described" },
  { slug: "good_gear_well_maintained", label: "Good gear & well maintained" },
  { slug: "fair_price", label: "Fair price & honest weights" },
  { slug: "prompt_payment", label: "Paid on time" },
  { slug: "great_communication", label: "Easy to deal with" },
  { slug: "safe_operator", label: "Safe around stock & machinery" },
  { slug: "quality_fencing", label: "Quality workmanship" },
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
  { slug: "bought_item", label: "Bought livestock, hay, grain or gear" },
  { slug: "sold_item", label: "Sold to this buyer" },
  { slug: "hired_worker", label: "Hired for farm / contracting work" },
  { slug: "worked_for", label: "Worked for this property / employer" },
  { slug: "fencing_service", label: "Used for fencing or rural contracting" },
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
  { slug: "farmer_grazier", label: "Farmer / Grazier" },
  { slug: "fencing_contractor", label: "Fencing Contractor" },
  { slug: "truck_driver_carrier", label: "Truck Driver / Carrier" },
  { slug: "machine_header_operator", label: "Header / Machine Operator" },
  { slug: "station_hand_shearer", label: "Station Hand / Shearer" },
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
  postcode: string | null;
  state: string | null;
  member_since: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  abn_verified: boolean;
  abn: string | null;
  abn_entity_name: string | null;
  claim_status: string | null;
  insurances_held: string[];
  role_tags: string[];
  years_in_district: number | null;
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
