// lib/rural-postcodes.ts
// Reusable Australian rural postcode filter to prevent metropolitan
// "suburban spillover" (Sydney, Newcastle, Central Coast, Wollongong, etc.)
// from polluting rural contractor, job, and freight directories.

export const NSW_EXCLUDED_METRO_RANGES: ReadonlyArray<readonly [number, number]> = [
  [2000, 2263], // Sydney Metro & Central Coast
  [2280, 2308], // Newcastle Metro
  [2500, 2530], // Wollongong Metro
  [2555, 2570], // Outer SW Sydney Metro (Leppington, Oran Park, Camden metro fringe)
  [2745, 2770], // Western Sydney Metro (Penrith, Blacktown, Mt Druitt)
] as const;

/**
 * Returns true if the given 4-digit Australian postcode belongs to a regional
 * or rural area (and is NOT in an excluded metropolitan range).
 */
export function isRuralPostcode(
  postcode: string | number | null | undefined,
  state?: string | null
): boolean {
  const raw = String(postcode ?? "").trim();
  if (!/^\d{4}$/.test(raw)) return false;

  const num = Number(raw);
  const normState = (state ?? "").trim().toUpperCase();

  // Check NSW metro exclusions whenever state is NSW, empty, or the postcode is in the 2000-2999 range
  const isNswRange =
    normState === "NSW" ||
    normState === "NEW SOUTH WALES" ||
    (!normState && num >= 2000 && num <= 2999);

  if (isNswRange || (num >= 2000 && num <= 2999)) {
    // Allow ACT rural/regional checks if explicitly ACT, otherwise apply NSW metro exclusions
    for (const [min, max] of NSW_EXCLUDED_METRO_RANGES) {
      if (num >= min && num <= max) {
        return false;
      }
    }
    // Also exclude NSW LVRs / PO Box only ranges in Sydney CBD (1000-1999)
    if (num >= 1000 && num <= 1999) {
      return false;
    }
  }

  return true;
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
