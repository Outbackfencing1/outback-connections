// lib/fencing-job.ts — Structured fencing-job brief helpers, fence type / length /
// timing options, and private farm address protection so exact property/road
// addresses never leak onto public job boards.

export const FENCE_TYPE_OPTIONS = [
  { slug: "hinge_joint", label: "Hinge Joint (e.g. 7/90/30, 8/90/30, 8/115/15)" },
  { slug: "fixed_knot_exclusion", label: "Fixed Knot / Exclusion (e.g. 16/180/15, 11/142/15)" },
  { slug: "plain_barbed_wire", label: "Plain & Barbed Wire" },
  { slug: "electric_subdivision", label: "Electric / Paddock Subdivision" },
  { slug: "cattle_sheep_yards", label: "Cattle / Sheep Yards & Gateways" },
  { slug: "boundary_repairs", label: "Boundary Repairs, Floodgates & Clearing" },
] as const;

export type FenceTypeSlug = (typeof FENCE_TYPE_OPTIONS)[number]["slug"];

export const FENCE_LENGTH_OPTIONS = [
  { slug: "under_500m", label: "Under 500m (Yards, gateways or short repairs)" },
  { slug: "500m_to_2km", label: "500m – 2 km" },
  { slug: "2km_to_5km", label: "2 km – 5 km" },
  { slug: "5km_to_10km", label: "5 km – 10 km" },
  { slug: "over_10km", label: "10 km+ (Large boundary or exclusion run)" },
] as const;

export type FenceLengthSlug = (typeof FENCE_LENGTH_OPTIONS)[number]["slug"];

export const FENCE_TIMING_OPTIONS = [
  { slug: "urgent_2_weeks", label: "Urgent / Within 2 weeks" },
  { slug: "within_1_month", label: "Within the next month" },
  { slug: "within_3_months", label: "Within 1–3 months" },
  { slug: "flexible_planning", label: "Flexible / Planning ahead for quotes" },
] as const;

export type FenceTimingSlug = (typeof FENCE_TIMING_OPTIONS)[number]["slug"];

export const FENCE_MATERIALS_OPTIONS = [
  { slug: "materials_on_farm", label: "Materials on farm (labour & rig only)" },
  { slug: "contractor_to_supply", label: "Contractor to supply materials & labour" },
  { slug: "need_materials_quote", label: "Need both contractor & materials quote" },
] as const;

export type FenceMaterialsSlug = (typeof FENCE_MATERIALS_OPTIONS)[number]["slug"];

export type FencingJobSpec = {
  fenceType?: string | null;
  approxLength?: string | null;
  timing?: string | null;
  materialsStatus?: string | null;
  terrainNotes?: string | null;
  photoUrls?: string[];
};

const FENCE_TYPE_MAP = new Map<string, string>(
  FENCE_TYPE_OPTIONS.map((o) => [o.slug, o.label])
);
const FENCE_LENGTH_MAP = new Map<string, string>(
  FENCE_LENGTH_OPTIONS.map((o) => [o.slug, o.label])
);
const FENCE_TIMING_MAP = new Map<string, string>(
  FENCE_TIMING_OPTIONS.map((o) => [o.slug, o.label])
);
const FENCE_MATERIALS_MAP = new Map<string, string>(
  FENCE_MATERIALS_OPTIONS.map((o) => [o.slug, o.label])
);

export function fenceTypeLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return FENCE_TYPE_MAP.get(slug) ?? slug;
}

export function fenceLengthLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return FENCE_LENGTH_MAP.get(slug) ?? slug;
}

export function fenceTimingLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return FENCE_TIMING_MAP.get(slug) ?? slug;
}

export function fenceMaterialsLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  return FENCE_MATERIALS_MAP.get(slug) ?? slug;
}

/**
 * Detects whether a text string contains an exact property/road/street address
 * (e.g. "1425 Cargo Road", "Lot 4 DP 123456", "RMB 240", "76 Astill Drive")
 * so public job descriptions keep exact farm addresses private.
 */
const STREET_ADDRESS_PATTERN =
  /\b(?:(?:RMB|Lot)\s*\d+|\d{1,5}[A-Za-z]?\s+[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?\s+(?:Road|Rd|Street|St|Lane|Ln|Drive|Dr|Highway|Hwy|Way|Track|Ave|Avenue))\b/i;

export function detectStreetAddressInPublicText(
  input: string | null | undefined
): boolean {
  if (!input) return false;
  return STREET_ADDRESS_PATTERN.test(input);
}

/**
 * Redacts exact street/road numbers from public-facing farm location or
 * description text while keeping the nearest town/suburb and postcode intact.
 */
export function redactStreetAddressForPublicDisplay(
  input: string | null | undefined
): string {
  if (!input) return "";
  return input.replace(
    /\b(?:(?:RMB|Lot)\s*\d+|\d{1,5}[A-Za-z]?\s+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)?\s+(?:Road|Rd|Street|St|Lane|Ln|Drive|Dr|Highway|Hwy|Way|Track|Ave|Avenue)))\b/gi,
    "[Private property address redacted]"
  );
}

export function sanitisePublicFarmLocation(params: {
  suburbOrTown?: string | null;
  postcode?: string | null;
  state?: string | null;
}): string {
  const rawTown = (params.suburbOrTown ?? "").trim();
  // Strip any leading street number or road name if accidentally entered into the town field
  const cleanTown = rawTown
    .replace(/^\d+[A-Za-z]?\s+/, "")
    .replace(
      /\b(?:Road|Rd|Street|St|Lane|Ln|Drive|Dr|Highway|Hwy)\b.*$/i,
      ""
    )
    .trim();

  const pc = (params.postcode ?? "").trim();
  const st = (params.state ?? "NSW").trim();

  const parts = [cleanTown || "Regional area", st, pc].filter(Boolean);
  return parts.join(" ");
}

/**
 * Formats a structured fencing job brief that can be embedded in a service
 * request or direct contractor quote enquiry.
 */
export function formatFencingJobSpecSummary(spec: FencingJobSpec): string {
  const lines: string[] = [];
  const fType = fenceTypeLabel(spec.fenceType);
  const fLen = fenceLengthLabel(spec.approxLength);
  const fTime = fenceTimingLabel(spec.timing);
  const fMat = fenceMaterialsLabel(spec.materialsStatus);

  if (fType) lines.push(`• Fence type: ${fType}`);
  if (fLen) lines.push(`• Approx. length: ${fLen}`);
  if (fTime) lines.push(`• Timing: ${fTime}`);
  if (fMat) lines.push(`• Materials: ${fMat}`);
  if (spec.terrainNotes && spec.terrainNotes.trim()) {
    lines.push(`• Country / terrain: ${spec.terrainNotes.trim()}`);
  }
  if (spec.photoUrls && spec.photoUrls.length > 0) {
    lines.push(`• Site photos attached: ${spec.photoUrls.join(" , ")}`);
  }

  if (lines.length === 0) return "";
  return `[Fencing Job Brief]\n${lines.join("\n")}`;
}
