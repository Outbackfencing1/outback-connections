// lib/trade-offer.ts
// Pure. Where the operator's disclosed trade offer (components/detail/
// TradeOfferCard.tsx) sends people. The card's buttons go through /go/trade
// so each click is logged as a trade_cta_click event, then redirect here.
// Destinations are fixed: the route never redirects to a URL it was given.

export const FENCING_CATEGORIES = new Set(["fencing-contractor", "fencing-labour", "fencing"]);

const STORE_URL = "https://outbackfencingsupplies.com.au";

export const TRADE_TARGETS = {
  clipgun: "/products/20v-cordless-c-ring-gun",
  store: "/",
} as const;
export type TradeTarget = keyof typeof TRADE_TARGETS;

export const TRADE_PLACEMENTS = ["listing", "claim"] as const;
export type TradePlacement = (typeof TRADE_PLACEMENTS)[number];

export function isFencingCategory(slug: string | null | undefined): boolean {
  return !!slug && FENCING_CATEGORIES.has(slug);
}

/** The store URL, with the UTM tags Shopify reports on. */
export function tradeOfferDestination(target: TradeTarget, placement: TradePlacement): string {
  const utm = `utm_source=outbackconnections&utm_medium=trade_cta&utm_campaign=fencing_contractors&utm_content=${placement}`;
  return `${STORE_URL}${TRADE_TARGETS[target]}?${utm}`;
}

/** The card's link: our own redirect, which logs the click. */
export function tradeOfferHref(
  target: TradeTarget,
  placement: TradePlacement,
  categorySlug: string | null | undefined
): string {
  const qs = new URLSearchParams({ to: target, from: placement });
  if (isFencingCategory(categorySlug)) qs.set("cat", categorySlug!);
  return `/go/trade?${qs.toString()}`;
}

/** Read a /go/trade query string. Anything unknown falls back to the store's home page. */
export function parseTradeClick(params: URLSearchParams): {
  target: TradeTarget;
  placement: TradePlacement;
  category: string | null;
} {
  const to = params.get("to");
  const from = params.get("from");
  const cat = params.get("cat");
  return {
    target: to === "clipgun" ? "clipgun" : "store",
    placement: (TRADE_PLACEMENTS as readonly string[]).includes(from ?? "") ? (from as TradePlacement) : "listing",
    category: isFencingCategory(cat) ? cat : null,
  };
}
