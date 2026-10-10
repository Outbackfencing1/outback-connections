// app/go/trade/route.ts
// Tracked click on the operator's trade-pricing offer (TradeOfferCard).
// Logs a trade_cta_click event, then 302s to the fixed store URL for that
// button (lib/trade-offer.ts). Server-side, so it works without JavaScript,
// like /listings/[id]/source. Crawlers are kept out by robots.txt and
// rel="nofollow"; any that follow it anyway are flagged by user agent.
import { NextResponse, type NextRequest } from "next/server";
import { logEvent } from "@/lib/analytics";
import { parseTradeClick, tradeOfferDestination } from "@/lib/trade-offer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const click = parseTradeClick(req.nextUrl.searchParams);
  await logEvent({
    eventType: "trade_cta_click",
    vertical: "service",
    properties: { target: click.target, placement: click.placement, category: click.category },
  });
  return NextResponse.redirect(tradeOfferDestination(click.target, click.placement), 302);
}
