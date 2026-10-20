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

export const BOOKED_UNTIL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const AVAILABILITY_STALE_DAYS = 45;

export type BelievableAvailabilityDisplay = {
  headline: string;
  statusKind: "taking_bookings" | "booked_until" | "unconfirmed";
  updatedText: string;
  isStale: boolean;
  dotClass: string;
  badgeClass: string;
};

export function formatAustralianShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  });
}

/**
 * Formats contractor availability with staleness checking so farmers see
 * "Taking bookings", "Booked until November", or "Availability not recently confirmed"
 * alongside the date the owner last updated it.
 */
export function formatBelievableAvailability(params: {
  availabilityStatus?: string | null;
  availabilityNote?: string | null;
  availabilityUpdatedAt?: string | null;
  ownerConfirmed?: boolean;
  now?: Date;
}): BelievableAvailabilityDisplay {
  const now = params.now ?? new Date();
  const updatedDateText = formatAustralianShortDate(params.availabilityUpdatedAt);

  if (params.ownerConfirmed === false || !params.availabilityUpdatedAt || !updatedDateText) {
    return {
      headline: "Availability not recently confirmed",
      statusKind: "unconfirmed",
      updatedText:
        params.ownerConfirmed === false
          ? "Unclaimed listing — call directly to check current schedule"
          : "Availability date not yet confirmed by owner",
      isStale: true,
      dotClass: "bg-neutral-400",
      badgeClass: "border-neutral-300 bg-neutral-100 text-neutral-700",
    };
  }

  const updatedMs = new Date(params.availabilityUpdatedAt).getTime();
  const ageDays = (now.getTime() - updatedMs) / (1000 * 60 * 60 * 24);

  if (ageDays > AVAILABILITY_STALE_DAYS) {
    return {
      headline: "Availability not recently confirmed",
      statusKind: "unconfirmed",
      updatedText: `Last updated ${updatedDateText}`,
      isStale: true,
      dotClass: "bg-neutral-400",
      badgeClass: "border-neutral-300 bg-neutral-100 text-neutral-700",
    };
  }

  const cleanNote = (params.availabilityNote ?? "").trim();
  const status = params.availabilityStatus ?? "available";

  if (status === "booked_out" || (status === "available_soon" && cleanNote)) {
    const headline = cleanNote
      ? cleanNote.toLowerCase().startsWith("booked")
        ? cleanNote
        : `Booked until ${cleanNote}`
      : "Currently booked out";
    return {
      headline,
      statusKind: "booked_until",
      updatedText: `Updated ${updatedDateText}`,
      isStale: false,
      dotClass: "bg-amber-500",
      badgeClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }

  if (cleanNote) {
    const headline = cleanNote.toLowerCase().startsWith("booked")
      ? cleanNote
      : `Taking bookings (${cleanNote})`;
    return {
      headline,
      statusKind: cleanNote.toLowerCase().startsWith("booked")
        ? "booked_until"
        : "taking_bookings",
      updatedText: `Updated ${updatedDateText}`,
      isStale: false,
      dotClass: "bg-emerald-500",
      badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-950",
    };
  }

  return {
    headline: "Taking bookings",
    statusKind: "taking_bookings",
    updatedText: `Updated ${updatedDateText}`,
    isStale: false,
    dotClass: "bg-emerald-500",
    badgeClass: "border-emerald-300 bg-emerald-50 text-emerald-950",
  };
}

export const CONTRACTOR_EQUIPMENT_OPTIONS = [
  { slug: "post_driver_hydraulic", label: "Hydraulic Post Driver" },
  { slug: "tractor_post_rammer", label: "Tractor & Post Rammer" },
  { slug: "rock_drill_auger", label: "Rock Drill / Auger Rig" },
  { slug: "wire_dispensers", label: "Multi-Wire / Netting Unwinder" },
  { slug: "clipgun_pneumatic", label: "Power Clip Guns" },
  { slug: "skid_steer_loader", label: "Skid Steer / Bobcat / Loader" },
  { slug: "excavator_dozer", label: "Excavator / Fence-Line Clearing" },
  { slug: "mobile_welder_yards", label: "Mobile Welding & Cattle/Sheep Yard Rig" },
] as const;

export type ContractorEquipmentSlug = (typeof CONTRACTOR_EQUIPMENT_OPTIONS)[number]["slug"];

const EQUIPMENT_MAP = new Map<string, string>(
  CONTRACTOR_EQUIPMENT_OPTIONS.map((e) => [e.slug, e.label])
);

export function contractorEquipmentLabel(slug: string): string {
  return EQUIPMENT_MAP.get(slug) ?? slug;
}

export const PREFERRED_JOB_SIZES = [
  { slug: "any_size", label: "Any job size (repairs to full boundary runs)" },
  { slug: "small_repairs_under_1km", label: "Small jobs, gateways, yards & repairs (under 1 km)" },
  { slug: "medium_1km_to_5km", label: "Paddock subdivisions & medium runs (1–5 km)" },
  { slug: "large_5km_plus", label: "Large boundary & exclusion contracts (5 km+)" },
  { slug: "station_contract_10km_plus", label: "Station-scale & cluster fencing (10 km+)" },
] as const;

export type PreferredJobSizeSlug = (typeof PREFERRED_JOB_SIZES)[number]["slug"];

const PREFERRED_JOB_SIZE_MAP = new Map<string, string>(
  PREFERRED_JOB_SIZES.map((j) => [j.slug, j.label])
);

export function preferredJobSizeLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return PREFERRED_JOB_SIZE_MAP.get(slug) ?? slug;
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
  abnDetailsChecked: boolean;
};

/**
 * Evaluates whether a business claim can be auto-approved immediately based on
 * objective control proof (matching business email, matching website domain, or
 * active ABN combined with matching registered business phone on file).
 *
 * Scamwatch guidance: An ABN is a public number and does NOT by itself establish
 * that a claimant controls the business. Claims relying solely on an ABN match
 * from a generic webmail address without phone/email/domain corroboration are
 * recorded as `abnDetailsChecked: true` and routed to `admin_approval`.
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

  let abnNameOverlap = false;
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
    abnNameOverlap = bizWords.some((w) => abrLower.includes(w));
  }

  const abnDetailsChecked = Boolean(
    cleanSubmittedAbn &&
      ((cleanBizAbn && cleanSubmittedAbn === cleanBizAbn) ||
        abnNameOverlap ||
        params.abrIsActive)
  );

  // 1. Exact business email or custom business domain match
  if (emailMatchesFile) {
    return {
      autoApprove: true,
      method: "email_domain",
      reason: "Signed-in email matches the business email on file.",
      phoneMatchesFile,
      emailMatchesFile,
      domainMatchesFile,
      abnDetailsChecked,
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
      abnDetailsChecked,
    };
  }

  // 2. Submitted valid ABN + matching registered business phone number on file
  if (cleanSubmittedAbn && phoneMatchesFile && params.abrIsActive !== false) {
    return {
      autoApprove: true,
      method: "abn_match",
      reason:
        "Valid 11-digit ABN combined with matching registered business phone number on file.",
      phoneMatchesFile,
      emailMatchesFile,
      domainMatchesFile,
      abnDetailsChecked: true,
    };
  }

  // 3. ABN matches ABR or file, but no email/domain/phone control proof yet -> manual owner confirmation
  if (abnDetailsChecked) {
    return {
      autoApprove: false,
      method: "admin_approval",
      reason:
        "ABN details checked against ABR, but an ABN alone does not prove business control (Scamwatch guidance). Queued for quick phone/email owner confirmation.",
      phoneMatchesFile,
      emailMatchesFile,
      domainMatchesFile,
      abnDetailsChecked: true,
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
    abnDetailsChecked: false,
  };
}

export type SpecificTrustCheck = {
  key:
    | "owner_confirmed"
    | "abn_details_checked"
    | "insurance_self_declared"
    | "insurance_document_checked";
  label: string;
  status: "verified" | "self_declared" | "expired" | "unverified";
  detail: string;
  dateText: string | null;
};

/**
 * Builds the 4 distinct trust checks required for transparent rural verification:
 * 1. Owner confirmed (control of business verified via domain/email/phone/staff check)
 * 2. ABN details checked (public ABR lookup; explicitly notes ABN alone != ownership)
 * 3. Insurance self-declared (what coverages the operator states they hold)
 * 4. Insurance document checked (whether Outback Connections has sighted a current certificate & its expiry)
 */
export function buildSpecificTrustChecks(params: {
  claimStatus?: string | null;
  claimedAt?: string | null;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  hasBusinessRecord?: boolean;
  abn?: string | null;
  abnVerified?: boolean;
  abnEntityName?: string | null;
  abnVerifiedAt?: string | null;
  insurancesHeld?: string[] | null;
  insuranceVerifiedAt?: string | null;
  insuranceExpiryDate?: string | null;
  now?: Date;
}): SpecificTrustCheck[] {
  const now = params.now ?? new Date();
  const isOwnerConfirmed = params.hasBusinessRecord
    ? params.claimStatus === "claimed"
    : Boolean(params.claimStatus === "claimed" || params.emailVerified || params.phoneVerified);

  const claimedDate = formatAustralianShortDate(params.claimedAt);
  const abnDate = formatAustralianShortDate(params.abnVerifiedAt);
  const formattedAbn = formatAbn(params.abn);
  const abnChecked = Boolean(params.abnVerified && formattedAbn);

  const held = (params.insurancesHeld ?? []).filter(isValidInsuranceBadge);
  const insVerifiedDate = formatAustralianShortDate(params.insuranceVerifiedAt);
  const insExpiryDate = formatAustralianShortDate(params.insuranceExpiryDate);

  let insDocStatus: SpecificTrustCheck["status"] = "unverified";
  let insDocDetail = "Certificate of currency not yet sighted by Outback Connections";
  let insDocDateText: string | null = null;

  if (params.insuranceVerifiedAt && insVerifiedDate) {
    if (params.insuranceExpiryDate) {
      const expiryMs = new Date(params.insuranceExpiryDate).getTime();
      if (!Number.isNaN(expiryMs) && expiryMs < now.getTime()) {
        insDocStatus = "expired";
        insDocDetail = `Certificate expired ${insExpiryDate ?? params.insuranceExpiryDate}`;
        insDocDateText = `Checked ${insVerifiedDate}`;
      } else {
        insDocStatus = "verified";
        insDocDetail = insExpiryDate
          ? `Certificate sighted · Expires ${insExpiryDate}`
          : "Certificate of currency sighted";
        insDocDateText = `Checked ${insVerifiedDate}`;
      }
    } else {
      insDocStatus = "verified";
      insDocDetail = "Certificate of currency sighted";
      insDocDateText = `Checked ${insVerifiedDate}`;
    }
  }

  return [
    {
      key: "owner_confirmed",
      label: "Owner confirmed",
      status: isOwnerConfirmed ? "verified" : "unverified",
      detail: isOwnerConfirmed
        ? "Account holder confirmed via business contact or staff check"
        : "Unclaimed directory profile — owner has not yet confirmed control",
      dateText: isOwnerConfirmed && claimedDate ? `Confirmed ${claimedDate}` : null,
    },
    {
      key: "abn_details_checked",
      label: "ABN details checked",
      status: abnChecked ? "verified" : "unverified",
      detail: abnChecked
        ? `ABN ${formattedAbn}${params.abnEntityName ? ` (${params.abnEntityName})` : ""} active on ABR. Note: an ABN is public and does not by itself prove business control.`
        : "No ABN verified on file yet",
      dateText: abnChecked && abnDate ? `Checked ${abnDate}` : null,
    },
    {
      key: "insurance_self_declared",
      label: "Insurance self-declared",
      status: held.length > 0 ? "self_declared" : "unverified",
      detail:
        held.length > 0
          ? `Operator self-declared: ${held.map(insuranceBadgeLabel).join(", ")}`
          : "No insurance cover declared on profile",
      dateText: null,
    },
    {
      key: "insurance_document_checked",
      label: "Insurance document checked",
      status: insDocStatus,
      detail: insDocDetail,
      dateText: insDocDateText,
    },
  ];
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
  review_kind?: "review" | "vouch" | null;
};

/**
 * Distinguishes a genuine Completed-Work Review from a 1-click Neighbour Vouch.
 * Quick vouches have `deal_type === "general"` and `comment === null` (or `review_kind === "vouch"`).
 * Only reviews with a specific dealing type and a written comment count toward star ratings.
 */
export function isCompletedWorkReview(
  row: Pick<VendorReviewRow, "deal_type" | "comment" | "review_kind">
): boolean {
  if (row.review_kind === "vouch") return false;
  if (row.review_kind === "review") return true;
  const hasSpecificDealing = Boolean(row.deal_type && row.deal_type !== "general");
  const hasWrittenComment = Boolean(row.comment && row.comment.trim().length >= 10);
  return hasSpecificDealing && hasWrittenComment;
}

export function partitionReviewsAndVouches(rows: VendorReviewRow[]): {
  completedReviews: VendorReviewRow[];
  quickVouches: VendorReviewRow[];
  completedReviewCount: number;
  vouchCount: number;
  avgRating: number | null;
  recommendPct: number | null;
} {
  const completedReviews: VendorReviewRow[] = [];
  const quickVouches: VendorReviewRow[] = [];

  for (const r of rows) {
    if (isCompletedWorkReview(r)) {
      completedReviews.push(r);
    } else {
      quickVouches.push(r);
    }
  }

  const completedReviewCount = completedReviews.length;
  const vouchCount = quickVouches.length;

  let avgRating: number | null = null;
  let recommendPct: number | null = null;

  if (completedReviewCount > 0) {
    const sum = completedReviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    avgRating = Math.round((sum / completedReviewCount) * 10) / 10;
    const recCount = completedReviews.filter((r) => r.would_recommend).length;
    recommendPct = Math.round((recCount / completedReviewCount) * 100);
  }

  return {
    completedReviews,
    quickVouches,
    completedReviewCount,
    vouchCount,
    avgRating,
    recommendPct,
  };
}

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
  abn_verified_at?: string | null;
  claim_status: string | null;
  claimed_at?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  facebook_url?: string | null;
  services_offered?: string[];
  photo_urls?: string[];
  insurances_held: string[];
  insurance_verified_at?: string | null;
  insurance_expiry_date?: string | null;
  role_tags: string[];
  years_in_district: number | null;
  availability_status?: string | null;
  availability_note?: string | null;
  availability_updated_at?: string | null;
  travel_area?: string | null;
  equipment_summary?: string[] | null;
  preferred_job_size?: string | null;
  outback_verified?: boolean;
  active_listings_count: number;
  completed_deals_count: number;
  enquiry_forwarded: number;
  enquiry_answered: number;
  enquiry_responded: number;
  review_count: number;
  vouch_count?: number;
  avg_rating: number | null;
  recommend_pct: number | null;
  top_tags: Array<{ tag: string; count: number }>;
  recent_reviews: VendorReviewRow[];
};



