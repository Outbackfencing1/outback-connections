// components/detail/TradeOfferCard.tsx — server component.
// The operator's own, DISCLOSED offer to fencing contractors. Outback
// Connections is run by Outback Fencing & Steel Supplies; this card says so
// in plain words and only appears on fencing listings. It is the one
// commercial element on the page and is labelled as such.
// Both buttons go through /go/trade, which logs the click (trade_cta_click)
// and redirects to the store with the UTM tags.
import Link from "next/link";
import { isFencingCategory, tradeOfferHref } from "@/lib/trade-offer";

export default function TradeOfferCard({
  categorySlug,
  placement,
}: {
  categorySlug: string | null | undefined;
  /** Where it's shown; lands in utm_content so we can see which placement converts. */
  placement: "listing" | "claim";
}) {
  if (!isFencingCategory(categorySlug)) return null;
  const productUrl = tradeOfferHref("clipgun", placement, categorySlug);
  const storeUrl = tradeOfferHref("store", placement, categorySlug);

  return (
    <aside
      aria-label="Offer from the site operator"
      className="mt-8 rounded-xl border border-green-200 bg-green-50 p-5 text-sm"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
        From the people who run this site
      </p>
      <p className="mt-2 font-semibold text-neutral-900">
        Fencing contractor? Trade pricing on clips, wire, posts and the Outback cordless
        clipgun.
      </p>
      <p className="mt-1 text-neutral-700">
        Outback Connections is run by Outback Fencing &amp; Steel Supplies in Orange NSW. We
        sell direct to contractors across rural Australia.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <a
          href={productUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="rounded-lg bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800"
        >
          See the clipgun →
        </a>
        <a
          href={storeUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="rounded-lg border border-green-700 bg-white px-4 py-2 font-semibold text-green-800 hover:bg-green-100"
        >
          Ask about trade pricing
        </a>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        This is our own offer, shown because this listing is in a fencing category. Nothing
        else on this page is paid or sponsored.{" "}
        <Link href="/about" className="underline">
          Who we are
        </Link>
        .
      </p>
    </aside>
  );
}
