// lib/sale.ts
// Pure helpers for "for sale" listings: option lists, labels, and the price
// text shown on cards and detail pages. No server imports.

export const PRICE_TYPES = ["fixed", "negotiable", "per_head", "per_bale", "per_tonne", "per_unit", "free", "poa"] as const;
export type PriceType = (typeof PRICE_TYPES)[number];

export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  fixed: "Fixed price",
  negotiable: "Negotiable",
  per_head: "Per head",
  per_bale: "Per bale",
  per_tonne: "Per tonne",
  per_unit: "Per unit",
  free: "Free to a good home",
  poa: "Price on application",
};

export const CONDITIONS = ["new", "used", "na"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABELS: Record<Condition, string> = { new: "New", used: "Used", na: "Not applicable" };

export const DELIVERY = ["pickup", "can_deliver", "either"] as const;
export type Delivery = (typeof DELIVERY)[number];
export const DELIVERY_LABELS: Record<Delivery, string> = {
  pickup: "Pickup only",
  can_deliver: "Can deliver",
  either: "Pickup or delivery",
};

/** "1,250" or "1250.50" -> 125050. Empty/blank -> null. Rejects negatives and junk. */
export function dollarsToCents(input: string | null | undefined): number | null | "invalid" {
  const s = (input ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return "invalid";
  const n = Math.round(parseFloat(s) * 100);
  if (!Number.isFinite(n) || n > 99_999_999_00) return "invalid";
  return n;
}

export function formatAud(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** The one-line price a buyer sees. Honest about what's unknown. */
export function priceLine(d: { price_cents: number | null; price_type: string; unit?: string | null }): string {
  const t = d.price_type as PriceType;
  if (t === "free") return "Free";
  if (t === "poa" || d.price_cents === null) return t === "negotiable" ? "Price negotiable" : "Price on application";
  const amount = formatAud(d.price_cents);
  switch (t) {
    case "per_head":
      return `${amount} per head`;
    case "per_bale":
      return `${amount} per bale`;
    case "per_tonne":
      return `${amount} per tonne`;
    case "per_unit":
      return `${amount} each${d.unit ? ` (${d.unit})` : ""}`;
    case "negotiable":
      return `${amount} negotiable`;
    default:
      return amount;
  }
}

export function quantityLine(d: { quantity: number | null; unit?: string | null }): string | null {
  if (d.quantity === null || d.quantity === undefined) return null;
  const q = Number(d.quantity);
  const n = Number.isInteger(q) ? q.toLocaleString("en-AU") : q.toLocaleString("en-AU", { maximumFractionDigits: 2 });
  return d.unit ? `${n} ${d.unit}` : n;
}
