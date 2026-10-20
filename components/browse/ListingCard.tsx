// components/browse/ListingCard.tsx — server component, used by all browse
// pages. Shows 1-click direct Call / SMS / Email / Website buttons so
// farmers and customers can reach vendors & contractors in 0 extra clicks.
import Link from "next/link";
import { kindLabel, listingHref, relativeTime, teaser } from "@/lib/format";
import { formatListingDescription } from "@/lib/seo";
import { formatPhoneHref, isAustralianMobile } from "@/lib/trust";
import { formatJobRate, jobDirectionBadge, ticketLabel, travelRadiusLabel } from "@/lib/work-board";

type BusinessBrief = {
  claim_status?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  suburb?: string | null;
  outback_verified?: boolean | null;
};

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
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  suburb?: string | null;
  outback_verified?: boolean | null;
  business?: BusinessBrief | null;
  job_meta?: {
    direction?: string | null;
    work_type?: string | null;
    pay_type?: string | null;
    pay_amount?: number | null;
    tickets?: string[] | null;
    travel_willingness?: string | null;
    experience_years?: number | null;
    accommodation_provided?: boolean | null;
    start_date?: string | null;
    duration?: string | null;
  } | null;
};

const WORK_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  casual: "Casual",
  contract: "Contract",
  seasonal: "Seasonal",
};

export default function ListingCard({ listing }: { listing: Listing }) {
  const claimStatus =
    listing.business_claim_status ?? listing.business?.claim_status ?? null;
  const isSyndicated =
    listing.data_source === "scraped" && listing.source_platform === "adzuna";
  const isScraped =
    listing.data_source === "scraped" &&
    !isSyndicated &&
    (!claimStatus || claimStatus === "unclaimed");
  const trustBadge =
    claimStatus === "claimed" || claimStatus === "trusted"
      ? "✓ Owner confirmed"
      : claimStatus === "abn_verified"
        ? "ABN checked"
        : null;
  const isOutbackVerified = !!(
    listing.outback_verified ||
    listing.business?.outback_verified ||
    claimStatus === "trusted"
  );

  const phone = listing.contact_phone || listing.business?.contact_phone || null;
  const phoneHref = formatPhoneHref(phone);
  const canSms = isAustralianMobile(phone);
  const email = listing.contact_email || listing.business?.contact_email || null;
  const website = listing.website_url || listing.business?.website_url || null;
  const suburb = listing.suburb || listing.business?.suburb || null;

  const jobMeta = listing.job_meta ?? null;
  const dirBadge = listing.kind === "job" && jobMeta?.direction
    ? jobDirectionBadge(jobMeta.direction)
    : null;
  const rateText = jobMeta ? formatJobRate(jobMeta) : null;
  const radiusText = jobMeta ? travelRadiusLabel(jobMeta.travel_willingness) : null;
  const workTypeText = jobMeta?.work_type
    ? WORK_TYPE_LABELS[jobMeta.work_type] ?? jobMeta.work_type
    : null;
  const tickets = Array.isArray(jobMeta?.tickets) ? jobMeta.tickets : [];
  const hasAccommFromDesc = /\baccommodation\s+(?:provided|included|available)|quarters\s+provided|cottage\s+provided\b/i.test(
    listing.description
  );
  const accommodationLabel =
    jobMeta?.accommodation_provided === true || hasAccommFromDesc
      ? "🏡 Accommodation provided"
      : tickets.includes("own_ute_swag")
        ? "⛺ Self-contained (Ute / Swag)"
        : null;

  const href = listingHref(listing.kind, listing.slug);
  const displayDescription = formatListingDescription({
    description: listing.description,
    businessName: listing.title,
    categoryName: listing.category?.label,
    suburb,
    postcode: listing.postcode,
    state: listing.state,
    unclaimed: isScraped,
  });

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition hover:border-green-700 hover:shadow-md">
      <Link href={href} className="block group">
        {/* Phones: title on its own lines, badges wrap below it. From sm up:
            title left, badges right. Long or unbroken names wrap, never push
            the card (or the page) sideways. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h3 className="min-w-0 text-base font-semibold text-neutral-900 group-hover:text-green-800 [overflow-wrap:anywhere] sm:text-lg">
            {listing.title}
          </h3>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
            {isOutbackVerified && (
              <span className="rounded-full border border-amber-400 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-950">
                ★ Outback Verified
              </span>
            )}
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
              <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                Unclaimed Profile — Is this your business? Claim for free
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
          {suburb ? `${suburb}, ` : ""}
          {listing.state
            ? `${listing.postcode} ${listing.state}`
            : `Postcode ${listing.postcode}`}
          {radiusText ? ` (${radiusText})` : ""}
          {jobMeta?.experience_years ? ` · ${jobMeta.experience_years}+ yrs exp` : ""} ·{" "}
          {relativeTime(listing.created_at)}
        </p>

        {/* Easy-to-Compare Rural Job Comparison Strip (Pay, Duration/Type, Start, Accommodation, Travel) */}
        {listing.kind === "job" &&
          (rateText ||
            workTypeText ||
            jobMeta?.start_date ||
            jobMeta?.duration ||
            accommodationLabel ||
            radiusText) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-800">
              <span className="font-semibold text-neutral-900">
                💰 {rateText ?? "Pay: Negotiable"}
              </span>
              {workTypeText && (
                <span className="rounded bg-white px-2 py-0.5 font-medium text-neutral-700 border border-neutral-200">
                  ⏱ {workTypeText}
                  {jobMeta?.duration ? ` · ${jobMeta.duration}` : ""}
                </span>
              )}
              {jobMeta?.start_date && (
                <span className="rounded bg-white px-2 py-0.5 font-medium text-neutral-700 border border-neutral-200">
                  📅 Starts {jobMeta.start_date}
                </span>
              )}
              {accommodationLabel && (
                <span className="rounded bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 border border-emerald-200">
                  {accommodationLabel}
                </span>
              )}
              {radiusText && (
                <span className="rounded bg-white px-2 py-0.5 font-medium text-neutral-700 border border-neutral-200">
                  🛻 {radiusText}
                </span>
              )}
            </div>
          )}

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
              <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-0.5 text-xs text-neutral-500">
                +{tickets.length - 6} more
              </span>
            )}
          </div>
        )}

        <p className="mt-3 text-sm text-neutral-700">
          {teaser(displayDescription, 190)}
        </p>
      </Link>

      {/* 0-Click Direct Contact Footer Bar */}
      {(phoneHref || email || website) && (
        <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            {phoneHref && (
              <a
                href={`tel:${phoneHref}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-green-800"
              >
                📞 Call {phone}
              </a>
            )}
            {phoneHref && canSms && (
              <a
                href={`sms:${phoneHref}?body=${encodeURIComponent(
                  `Hi ${listing.title}, saw your listing on Outback Connections (${listing.postcode}) — are you available?`
                )}`}
                className="inline-flex items-center gap-1 rounded-lg border border-green-700 bg-green-50 px-2.5 py-1.5 text-xs font-semibold text-green-900 hover:bg-green-100"
              >
                💬 SMS
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}?subject=${encodeURIComponent(
                  `Enquiry via Outback Connections: ${listing.title}`
                )}`}
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-800 hover:border-green-700 hover:text-green-800"
              >
                ✉️ Email
              </a>
            )}
            {website && (
              <a
                href={website}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-800 hover:border-green-700 hover:text-green-800"
              >
                🌐 Website
              </a>
            )}
          </div>
          <Link
            href={href}
            className="text-xs font-semibold text-green-800 hover:underline"
          >
            Details &amp; reviews →
          </Link>
        </div>
      )}
    </div>
  );
}

