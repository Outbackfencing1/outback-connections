// components/browse/ListingCard.tsx — server component, used by all browse
// pages. Public-safe: never renders contact_email or contact_phone.
import Link from "next/link";
import { kindLabel, listingHref, relativeTime, teaser } from "@/lib/format";

type Listing = {
  anonymised_id: string;
  slug: string;
  kind: string;
  title: string;
  description: string;
  postcode: string;
  state: string | null;
  created_at: string;
  category: { slug: string; label: string } | null;
  data_source?: string | null;
};

export default function ListingCard({ listing }: { listing: Listing }) {
  const isScraped = listing.data_source === "scraped";
  return (
    <Link
      href={listingHref(listing.kind, listing.slug)}
      className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-neutral-900 sm:text-lg">
          {listing.title}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          {isScraped && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-800">
              Unclaimed
            </span>
          )}
          <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
            {kindLabel(listing.kind)}
          </span>
        </div>
      </div>

      <p className="mt-1 text-xs text-neutral-600">
        {listing.category?.label ?? "—"} ·{" "}
        {listing.state
          ? `${listing.postcode} ${listing.state}`
          : `Postcode ${listing.postcode}`}{" "}
        · {relativeTime(listing.created_at)}
      </p>

      <p className="mt-3 text-sm text-neutral-700">
        {teaser(listing.description, 160)}
      </p>
    </Link>
  );
}
