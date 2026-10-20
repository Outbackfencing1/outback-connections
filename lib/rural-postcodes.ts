// lib/rural-postcodes.ts
// State-aware Australian rural/regional postcode validation.
// Prevents metropolitan "suburban spillover" and CBD PO Box ranges from
// polluting rural contractor, job, and freight directories.

export const NSW_EXCLUDED_METRO_RANGES: ReadonlyArray<readonly [number, number]> = [
  [1000, 1999], // Sydney CBD LVRs & PO Boxes
  [2000, 2263], // Sydney Metro & Central Coast
  [2280, 2308], // Newcastle Metro
  [2500, 2530], // Wollongong Metro
  [2555, 2570], // Outer SW Sydney Metro (Leppington, Oran Park, Camden metro fringe)
  [2745, 2770], // Western Sydney Metro (Penrith, Blacktown, Mt Druitt)
] as const;

export const INTERSTATE_CBD_AND_LVR_EXCLUSIONS: ReadonlyArray<readonly [number, number]> = [
  [1000, 1999], // NSW LVRs (never rural regardless of state label)
  [3000, 3008], // Melbourne CBD / Docklands
  [4000, 4006], // Brisbane CBD / Inner City
  [5000, 5005], // Adelaide CBD
  [6000, 6005], // Perth CBD
  [8000, 9999], // National LVR / PO Box only ranges
] as const;

/**
 * Returns true if the given 4-digit Australian postcode belongs to a regional
 * or rural area (and is NOT in an excluded metropolitan or LVR range).
 */
export function isRuralPostcode(
  postcode: string | number | null | undefined,
  state?: string | null
): boolean {
  const raw = String(postcode ?? "").trim();
  if (!/^\d{4}$/.test(raw)) return false;

  const num = Number(raw);
  const normState = (state ?? "").trim().toUpperCase();

  // Always exclude national LVR / PO Box ranges (1000-1999, 8000-9999) and major capital CBDs
  for (const [min, max] of INTERSTATE_CBD_AND_LVR_EXCLUSIONS) {
    if (num >= min && num <= max) {
      return false;
    }
  }

  // Apply NSW metro exclusions whenever the postcode falls in the NSW 2000-2999 range
  // (unless it is a valid ACT postcode 2600-2618 with state ACT).
  if (num >= 2000 && num <= 2999) {
    if (normState === "ACT" && num >= 2600 && num <= 2618) {
      return true;
    }
    for (const [min, max] of NSW_EXCLUDED_METRO_RANGES) {
      if (num >= min && num <= max) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Returns true if the postcode is excluded as a metropolitan, CBD, or LVR/PO Box postcode.
 */
export function isExcludedMetroPostcode(
  postcode: string | number | null | undefined,
  state?: string | null
): boolean {
  return !isRuralPostcode(postcode, state);
}

/**
 * Filter an array of records with a `postcode` (and optional `state`) field
 * down to rural postcodes only.
 */
export function filterRuralRecords<
  T extends { postcode?: string | null; state?: string | null; state_code?: string | null }
>(rows: T[]): T[] {
  return rows.filter((r) => isRuralPostcode(r.postcode, r.state ?? r.state_code ?? null));
}
