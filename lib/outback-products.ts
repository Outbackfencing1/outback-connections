// lib/outback-products.ts
// Centralised product reference and Daryl handoff helpers for Outback Fencing & Steel Supplies
// (https://outbackfencingsupplies.com.au/).
//
// IMPORTANT:
// - Outback Connections is a FREE rural work, jobs, freight, and services hub.
// - Outback Fencing & Steel Supplies products have a clear, modest, disclosed supporting place.
// - Product relevance NEVER determines whether a rural business, worker, carrier, or employer
//   belongs in the free hub.
// - All prices are AUD including GST unless explicitly marked otherwise, and carry a lastCheckedDate
//   plus live-storefront caveats so staff never invent or over-promise prices, stock, or freight.

export const OUTBACK_STORE_BASE_URL = "https://outbackfencingsupplies.com.au";
export const PRODUCT_REFERENCE_LAST_CHECKED = "2026-10-20";
export const DARYL_SALES_PHONE = "0421 572 245";
export const DARYL_SALES_EMAIL = "sales@outbackfencingsupplies.com.au";

export interface OutbackProductReference {
  id: string;
  name: string;
  category: "clipgun_bundle" | "clips_accessory" | "mesh" | "pickets" | "gates_wire";
  /** Merchandising order within category (1 = lead offer; Skin Only must always be last). */
  merchandisingRank: number;
  url: string;
  priceAudIncGstDisplay: string;
  taxBasis: "AUD inc GST";
  lastCheckedDate: string;
  checkoutMode: "online_cart" | "online_or_quote" | "quote_via_daryl";
  inclusionsSummary: string;
  compatibilityOrSpecNote: string;
  /** Live storefront / inventory caveat that staff must respect before quoting. */
  staffCaveat: string | null;
}

/**
 * Australia Clip Gun Merchandising Hierarchy (Strict Compliance):
 * 1. Lead with Full Kit ($1,699) and working bundles (Ready to Work, Contractor Kit, Milwaukee Crew Kit).
 * 2. Place Skin Only ($1,499) LAST. Never make Skin Only the default or primary offer.
 */
export const OUTBACK_CLIPGUN_BUNDLES: readonly OutbackProductReference[] = [
  {
    id: "clipgun-full-kit",
    name: "18V Cordless Clip Gun — Full Kit",
    category: "clipgun_bundle",
    merchandisingRank: 1,
    url: `${OUTBACK_STORE_BASE_URL}/products/20v-cordless-c-ring-gun`,
    priceAudIncGstDisplay: "$1,699",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_cart",
    inclusionsSummary:
      "1 × 18V Clipgun + 1 × 18V 4.0Ah Battery + 240V Charger + Carry Bag + Belt Clip + Manual (no standard clip box or Milwaukee adaptor included unless part of an active promotion).",
    compatibilityOrSpecNote:
      "All Outback Clipgun batteries are 18V (18V 4.0Ah high-output lithium-ion). Fits Makita 18V directly; runs Milwaukee M18 via the Milwaukee M18 Adaptor.",
    staffCaveat:
      "Do not alter the existing /products/20v-cordless-c-ring-gun URL slug without redirect verification, and never use '20V', 'brushless', or cell brand names in customer copy.",
  },
  {
    id: "clipgun-ready-to-work",
    name: "Ready to Work Bundle",
    category: "clipgun_bundle",
    merchandisingRank: 2,
    url: `${OUTBACK_STORE_BASE_URL}/products/20v-cordless-c-ring-gun`,
    priceAudIncGstDisplay: "$1,879",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_cart",
    inclusionsSummary:
      "Everything in the Full Kit + 10,000 C24 Stainless Clips (1 box).",
    compatibilityOrSpecNote:
      "18V 4.0Ah battery standard; direct Makita 18V compatibility.",
    staffCaveat: null,
  },
  {
    id: "clipgun-contractor-kit",
    name: "Contractor Kit",
    category: "clipgun_bundle",
    merchandisingRank: 3,
    url: `${OUTBACK_STORE_BASE_URL}/products/20v-cordless-c-ring-gun`,
    priceAudIncGstDisplay: "$2,699",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_cart",
    inclusionsSummary:
      "Everything in the Full Kit + 2 Extra 18V 4.0Ah Batteries (3 batteries total) + 40,000 C24 Stainless Clips (4 boxes).",
    compatibilityOrSpecNote:
      "Built for contract fencing crews running multiple lines.",
    staffCaveat: null,
  },
  {
    id: "clipgun-milwaukee-crew-kit",
    name: "Milwaukee Crew Kit",
    category: "clipgun_bundle",
    merchandisingRank: 4,
    url: `${OUTBACK_STORE_BASE_URL}/products/20v-cordless-c-ring-gun`,
    priceAudIncGstDisplay: "$1,749",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_cart",
    inclusionsSummary:
      "1 × Tool / Skin + Milwaukee M18 Adaptor INCLUDED + 20,000 C24 Stainless Clips (2 boxes). (No battery, charger, or carry bag).",
    compatibilityOrSpecNote:
      "Requires customer's own Milwaukee M18 batteries (connects via the included Milwaukee M18 Adaptor).",
    staffCaveat:
      "Never claim Milwaukee M18 batteries connect directly without the adaptor.",
  },
  {
    id: "clipgun-skin-only",
    name: "18V Clip Gun — Skin Only (Place Last)",
    category: "clipgun_bundle",
    merchandisingRank: 99,
    url: `${OUTBACK_STORE_BASE_URL}/products/20v-cordless-c-ring-gun`,
    priceAudIncGstDisplay: "$1,499",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_cart",
    inclusionsSummary:
      "1 × Tool Only (no battery, charger, clips, adaptor, or carry bag).",
    compatibilityOrSpecNote:
      "Fits Makita 18V batteries directly, or Milwaukee M18 with separate adaptor.",
    staffCaveat:
      "Always place Skin Only LAST in any bundle list. Never lead with Skin Only in Australia.",
  },
] as const;

export const OUTBACK_FENCING_AND_ACCESSORY_PRODUCTS: readonly OutbackProductReference[] = [
  {
    id: "c24-stainless-clips",
    name: "C24 Stainless Steel Fencing Clips (Box of 10,000)",
    category: "clips_accessory",
    merchandisingRank: 1,
    url: `${OUTBACK_STORE_BASE_URL}/products/fencing-clips`,
    priceAudIncGstDisplay: "$220 / box (check live tier/bundle pricing)",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_cart",
    inclusionsSummary: "10,000 stainless steel C24 clips per box.",
    compatibilityOrSpecNote: "Suits the Outback 18V Cordless Clip Gun for tying mesh to plain/belly wires.",
    staffCaveat: "Confirm multi-box trade pricing on live product page before quoting bulk discounts.",
  },
  {
    id: "milwaukee-m18-adaptor",
    name: "Milwaukee M18 Battery Adaptor",
    category: "clips_accessory",
    merchandisingRank: 2,
    url: `${OUTBACK_STORE_BASE_URL}/products/battery-adapter`,
    priceAudIncGstDisplay: "Check live product page ($40 rule baseline vs $45 live storefront)",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_cart",
    inclusionsSummary: "1 × Milwaukee M18 to Outback 18V Clipgun battery adaptor.",
    compatibilityOrSpecNote: "Required to run Milwaukee M18 batteries on the Outback 18V Clip Gun (included in the $1,749 Milwaukee Crew Kit).",
    staffCaveat:
      "PRICE RECONCILIATION NOTE (Task A06): Workspace rule specifies $40 add-on while live Shopify product page displayed $45 on 2026-10-20. Link to the live page rather than hardcoding the standalone dollar figure until Josh confirms.",
  },
  {
    id: "hinge-joint-mesh",
    name: "Outback Hinge Joint Mesh (100m – 500m rolls)",
    category: "mesh",
    merchandisingRank: 1,
    url: `${OUTBACK_STORE_BASE_URL}/collections/hinge-joint`,
    priceAudIncGstDisplay: "From $189.75 – $890 inc GST (varies by spec & roll length; check live collection)",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_or_quote",
    inclusionsSummary:
      "Core range: 7/90/30 (Mixed livestock #1 all-rounder), 8/90/30 (Heavy cattle), 8/90/15 (Ewes/lambs), 8/115/15 (Tall exclusion), 8/115/30 (Horses/boundary), 11/142/15 (Full exclusion), 11/142/30 (Kangaroos), 6/70/30, 6/90/30, 5/51/30.",
    compatibilityOrSpecNote:
      "Rolled in Orange NSW. Never quote 8/80/15 (never made) or 15cm-pocket 500m rolls.",
    staffCaveat:
      "Whole-job or multi-roll orders require roll length, picket spacing, and delivery postcode for Daryl to confirm freight.",
  },
  {
    id: "fixed-knot-16-180-15",
    name: "Fixed Knot Exclusion Mesh (16/180/15)",
    category: "mesh",
    merchandisingRank: 2,
    url: `${OUTBACK_STORE_BASE_URL}/pages/australian-national-field-days-deals`,
    priceAudIncGstDisplay: "Price & roll availability via Daryl quote (Field Days promo $500–$1,100; check active status)",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "quote_via_daryl",
    inclusionsSummary:
      "180cm height, 16 horizontal line wires, 15cm vertical stay spacing — 100m, 200m, and 250m rolls; top/bottom 2.8mm HT, inner 2.5mm MT.",
    compatibilityOrSpecNote: "Heavy-duty deer, pig, dog, and kangaroo exclusion fencing.",
    staffCaveat:
      "CATALOGUE CAVEAT (Task A06): Fixed Knot 16/180/15 is featured on the Field Days page, while underlying Shopify product rows were DRAFT on 2026-10-20. Always hand Fixed Knot enquiries to Daryl for a confirmed quote and lead time.",
  },
  {
    id: "outback-pickets",
    name: "Outback Pickets (Bitumen, Galvanised & Jumbo — Single or 400-Pack Slings)",
    category: "pickets",
    merchandisingRank: 1,
    url: `${OUTBACK_STORE_BASE_URL}/collections/star-pickets`,
    priceAudIncGstDisplay: "Single pickets & 400-pack slings (check live collection or route bulk sling quotes to Daryl)",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_or_quote",
    inclusionsSummary:
      "Sizes: 1.65m, 1.80m, 2.10m, 2.40m in Outback Bitumen Picket, Outback Galvanised Picket, and Outback Jumbo Picket finishes.",
    compatibilityOrSpecNote:
      "Always call fencing posts 'Pickets' (Outback Bitumen Picket / Outback Galvanised Picket / Outback Jumbo Picket).",
    staffCaveat:
      "Reserve Picket Slings carry preorder/quote flags on the storefront — hand bulk sling enquiries to Daryl to confirm dispatch and freight.",
  },
  {
    id: "gates-barbed-strainers",
    name: "N-Brace Farm Gates (12ft / 14ft / 16ft), 1.8mm HT Barbed Wire & Strainer Assemblies",
    category: "gates_wire",
    merchandisingRank: 1,
    url: `${OUTBACK_STORE_BASE_URL}/pages/australian-national-field-days-deals`,
    priceAudIncGstDisplay: "Online or whole-job quote via Daryl",
    taxBasis: "AUD inc GST",
    lastCheckedDate: PRODUCT_REFERENCE_LAST_CHECKED,
    checkoutMode: "online_or_quote",
    inclusionsSummary:
      "N-Brace Gates (12ft, 14ft, 16ft + hinge kits), 1.8mm HT Iowa Barbed Wire (500m rolls), 100NB × 2.4m Strainer Posts + 40NB/50NB Stays.",
    compatibilityOrSpecNote: "Never quote 1.57mm barbed wire (excluded from range).",
    staffCaveat:
      "Complete Rotech Strainer Assemblies are quote-only; DIY Strainer kits are active online. Route whole-fence packages to Daryl.",
  },
] as const;

export interface DarylHandoffPayload {
  customerName: string;
  businessName: string;
  suburbOrTown: string | null;
  state: string;
  postcode: string;
  phone: string | null;
  email: string | null;
  productOrJobNotes: string;
  sourceListingSlugOrPage: string;
  handedBy: string;
}

/**
 * Formats a clean, structured handoff brief for Daryl Kennewell so Ali never
 * invents custom quotes, freight estimates, or discount promises.
 */
export function buildDarylHandoffSummary(payload: DarylHandoffPayload): string {
  const locationLine = [payload.suburbOrTown, payload.state, payload.postcode]
    .filter(Boolean)
    .join(" ");
  return [
    `[PRODUCT HANDOFF TO DARYL — ${new Date().toISOString().slice(0, 10)}]`,
    `Business / Customer: ${payload.businessName}${payload.customerName ? ` (${payload.customerName})` : ""}`,
    `Location: ${locationLine}`,
    `Contact: ${[payload.phone, payload.email].filter(Boolean).join(" · ") || "See private outreach record"}`,
    `Source: ${payload.sourceListingSlugOrPage}`,
    `Product / Job Interest: ${payload.productOrJobNotes || "Requested trade pricing / quote follow-up"}`,
    `Action Required (Daryl): Confirm live pricing (AUD inc GST), roll/sling stock, and freight to ${payload.postcode}.`,
  ].join("\n");
}
