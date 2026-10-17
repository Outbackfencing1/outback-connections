// components/browse/ListingCard.tsx — server component, used by all browse
// pages. Public-safe: never renders contact_email or contact_phone.
import Link from "next/link";
import { kindLabel, listingHref, relativeTime, teaser } from "@/lib/format";
import { formatJobRate, jobDirectionBadge, ticketLabel, travelRadiusLabel } from "@/lib/work-board";

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
  source_platform?: string | null;
  business_claim_status?: string | null;
  job_meta?: {
    direction?: string | null;
    work_type?: string | null;
    pay_type?: string | null;
    pay_amount?: number | null;
    tickets?: string[] | null;
    travel_willingness?: string | null;
    experience_years?: number | null;
  } | null;
};

export default function ListingCard({ listing }: { listing: Listing }) {
  const isSyndicated =
    listing.data_source === "scraped" && listing.source_platform === "adzuna";
  const isScraped =
    listing.data_source === "scraped" &&
    !isSyndicated &&
    (!listing.business_claim_status || listing.business_claim_status === "unclaimed");
  const trustBadge =
    listing.business_claim_status === "abn_verified" || listing.business_claim_status === "trusted"
      ? "ABN verified"
      : listing.business_claim_status === "claimed"
        ? "Claimed"
        : null;

  const jobMeta = listing.job_meta ?? null;
  const dirBadge = listing.kind === "job" && jobMeta?.direction
    ? jobDirectionBadge(jobMeta.direction)
    : null;
  const rateText = jobMeta ? formatJobRate(jobMeta) : null;
  const radiusText = jobMeta ? travelRadiusLabel(jobMeta.travel_willingness) : null;
  const tickets = Array.isArray(jobMeta?.tickets) ? jobMeta.tickets : [];

  return (
    <Link
      href={listingHref(listing.kind, listing.slug)}
      className="block rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md"
    >
      {/* Phones: title on its own lines, badges wrap below it. From sm up:
          title left, badges right. Long or unbroken names wrap, never push
          the card (or the page) sideways. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <h3 className="min-w-0 text-base font-semibold text-neutral-900 [overflow-wrap:anywhere] sm:text-lg">
          {listing.title}
        </h3>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
          {rateText && (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900">
              {rateText}
            </span>
          )}
          {isSyndicated && (
            <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-sky-800">
              via Adzuna
            </span>
          )}
          {isScraped && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-800">
              Unclaimed
            </span>
          )}
          {trustBadge && (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-green-800">
              {trustBadge}
            </span>
          )}
          {dirBadge ? (
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ${
                dirBadge.isWorker
                  ? "bg-emerald-100 text-emerald-900"
                  : "bg-neutral-100 text-neutral-700"
              }`}
            >
              {dirBadge.label}
            </span>
          ) : (
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-neutral-700">
              {kindLabel(listing.kind)}
            </span>
          )}
        </div>
      </div>

      <p className="mt-1 text-xs text-neutral-600">
        {listing.category?.label ?? "—"} ·{" "}
        {listing.state
          ? `${listing.postcode} ${listing.state}`
          : `Postcode ${listing.postcode}`}
        {radiusText ? ` (${radiusText})` : ""}
        {jobMeta?.experience_years ? ` · ${jobMeta.experience_years}+ yrs exp` : ""} ·{" "}
        {relativeTime(listing.created_at)}
      </p>

      {tickets.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tickets.slice(0, 6).map((t) => (
            <span
              key={t}
              className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs text-neutral-700"
            >
              {ticketLabel(t)}
            </span>
          ))}
          {tickets.length > 6 && (
            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs text-neutral-500">
              +{tickets.length - 6} more
            </span>
          )}
        </div>
      )}

      <p className="mt-3 text-sm text-neutral-700">
        {teaser(listing.description, 160)}
      </p>
    </Link>
  );
}
