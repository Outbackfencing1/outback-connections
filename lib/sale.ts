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
  // sale_details.price_cents is int4: cap at $20,000,000.
  if (!Number.isFinite(n) || n > 2_000_000_000) return "invalid";
  return n;
}

export function formatAud(cents: number, opts: { whole?: boolean } = {}): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: opts.whole || cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: opts.whole ? 0 : 2,
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

export type CommodityGroup = {
  categorySlug: string;
  groupLabel: string;
  options: Array<{ code: string; label: string }>;
};

export const COMMODITY_GROUPS: readonly CommodityGroup[] = [
  {
    categorySlug: "livestock",
    groupLabel: "Livestock",
    options: [
      { code: "cattle_steers", label: "Cattle — steers / feeders" },
      { code: "cattle_heifers", label: "Cattle — heifers" },
      { code: "cattle_cows_calves", label: "Cattle — cows & calves / PTIC" },
      { code: "cattle_bulls", label: "Cattle — bulls" },
      { code: "sheep_ewes", label: "Sheep — ewes / breeders" },
      { code: "sheep_lambs", label: "Sheep — lambs / stores" },
      { code: "sheep_wethers_rams", label: "Sheep — wethers / rams" },
      { code: "goats", label: "Goats" },
      { code: "working_dogs", label: "Working dogs" },
      { code: "horses", label: "Horses" },
    ],
  },
  {
    categorySlug: "hay-fodder",
    groupLabel: "Hay & fodder",
    options: [
      { code: "lucerne_hay", label: "Lucerne hay" },
      { code: "wheaten_hay", label: "Wheaten hay" },
      { code: "oaten_hay", label: "Oaten hay" },
      { code: "vetch_clover_hay", label: "Vetch / clover / pasture hay" },
      { code: "silage", label: "Silage" },
      { code: "straw", label: "Straw / bedding" },
    ],
  },
  {
    categorySlug: "grain-feed",
    groupLabel: "Grain & stock feed",
    options: [
      { code: "wheat", label: "Wheat" },
      { code: "barley", label: "Barley" },
      { code: "oats", label: "Oats" },
      { code: "canola", label: "Canola" },
      { code: "sorghum_maize", label: "Sorghum / maize" },
      { code: "lupins_pulses", label: "Lupins / chickpeas / faba beans" },
      { code: "pellets_mix", label: "Stock pellets / ration / cottonseed" },
    ],
  },
  {
    categorySlug: "machinery",
    groupLabel: "Machinery & equipment",
    options: [
      { code: "tractor", label: "Tractor" },
      { code: "header_harvester", label: "Header / harvester / chaser bin" },
      { code: "hay_gear", label: "Baler / mower / rake" },
      { code: "tillage_seeding", label: "Airseeder / planter / tillage" },
      { code: "earthmoving", label: "Excavator / dozer / loader / skid steer" },
      { code: "livestock_handling_gear", label: "Cattle crush / yards / sheep handler / feeder" },
    ],
  },
  {
    categorySlug: "fencing-materials",
    groupLabel: "Fencing & steel",
    options: [
      { code: "hinge_joint_mesh", label: "Hinge joint / exclusion mesh" },
      { code: "pickets_posts", label: "Pickets / strainers / stays" },
      { code: "gates_cattle_rail", label: "Gates / cattle rail / panels" },
      { code: "plain_barbed_wire", label: "Plain / barbed wire & tools" },
    ],
  },
] as const;

const COMMODITY_LABEL_MAP: Record<string, string> = Object.fromEntries(
  COMMODITY_GROUPS.flatMap((g) => g.options.map((o) => [o.code, o.label]))
);

export function commodityLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return COMMODITY_LABEL_MAP[code] ?? code.replace(/_/g, " ");
}

export const HARVEST_SEASONS = [
  "2026/27 Season",
  "2025/26 Season",
  "Shedded / Stored",
  "Standing Crop / Paddock",
  "Weaned / Yard Prepared",
] as const;

