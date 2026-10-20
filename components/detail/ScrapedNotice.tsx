// components/detail/ScrapedNotice.tsx — server component.
// Shows the honest disclosure for unclaimed directory listings.
// Per AGENTS.md rule #2 & #3, discovered phone/email on unclaimed scraped rows
// are kept private in listing_sources.raw_payload until the owner claims and
// confirms them. Public visitors can visit the business's public website, view
// the original source listing, or send an enquiry via the form below.
import Link from "next/link";
import ClaimButton from "./ClaimButton";
import { prettyPlatform } from "@/lib/source-platforms";

export default function ScrapedNotice({
  title,
  sourcePlatform,
  sourceUrl,
  businessId = null,
  signedIn = false,
  signInRedirect = "/",
  listingId = null,
  sourceUrlKind = null,
  contactPhone = null,
  contactEmail = null,
  websiteUrl = null,
}: {
  title: string;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  businessId?: string | null;
  signedIn?: boolean;
  signInRedirect?: string;
  listingId?: string | null;
  /** "site" = the URL is the business's own page; "search" = a search on the
   *  named platform (we know where we saw it, not the exact page). */
  sourceUrlKind?: "site" | "search" | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  websiteUrl?: string | null;
}) {
  const platform = prettyPlatform(sourcePlatform);
  const isSearchLink = sourceUrlKind === "search";
  const linkLabel = isSearchLink
    ? `Find the original listing${platform ? ` on ${platform}` : ""} →`
    : "View the original listing →";
  const claimHref =
    `mailto:help@outbackconnections.com.au` +
    `?subject=${encodeURIComponent(`Claim listing: ${title}`)}` +
    `&body=${encodeURIComponent(
      `I'd like to claim this listing: ${title}.\n\nMy name:\nMy role at the business:\nBest contact number:\n`
    )}`;
  const fixOrRemoveHref =
    `mailto:help@outbackconnections.com.au` +
    `?subject=${encodeURIComponent(`Fix or remove listing: ${title}`)}` +
    `&body=${encodeURIComponent(
      `Listing: ${title}\n\nPlease (fix / remove) it.\nWhat should change:\nMy name and role at the business:\n`
    )}`;

  // Private contacts on unclaimed listings are intentionally never rendered publicly.
  void contactPhone;
  void contactEmail;

  return (
    <div className="space-y-4">
      {websiteUrl && (
        <div className="rounded-2xl border border-green-300 bg-green-50/60 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-green-800">
                Public Business Website
              </p>
              <p className="mt-0.5 text-sm font-semibold text-neutral-900">
                {title}
              </p>
            </div>
            <a
              href={websiteUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700 hover:text-green-900"
            >
              🌐 Visit Website →
            </a>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
        <span className="inline-block rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900">
          Unclaimed listing — Is this your business? Claim for free
        </span>
        <p className="mt-2 text-sm text-amber-900">
          This wasn&apos;t posted by the business. We found <strong>{title}</strong>
          {platform ? <> listed on {platform}</> : null} and added it to the
          directory so people can find it — the details haven&apos;t been confirmed
          by the owner yet, so direct phone and email stay private until they claim it.
        </p>
        <p className="mt-2 text-xs text-amber-900/90">
          <strong>Who sees your enquiry:</strong> When you use the quote form below on an unclaimed listing, our team in Orange forwards your request privately to <strong>{title}</strong> only — never to competing businesses.
        </p>
        {sourceUrl && (
          <p className="mt-3 text-sm">
            <a
              href={listingId ? `/listings/${listingId}/source` : sourceUrl}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="font-medium text-amber-900 underline"
            >
              {linkLabel}
            </a>
          </p>
        )}

        {/* Straightforward 3-button action bar: Claim this business | Report incorrect details | Remove my listing */}
        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-amber-200/80 pt-3.5">
          {businessId ? (
            <Link
              href={
                signedIn
                  ? `/claim/${businessId}`
                  : `/signin?next=${encodeURIComponent(`/claim/${businessId}`)}`
              }
              className="inline-flex items-center rounded-lg bg-amber-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-950"
            >
              ✓ Claim this business (Free)
            </Link>
          ) : (
            <a
              href={claimHref}
              className="inline-flex items-center rounded-lg bg-amber-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-950"
            >
              ✓ Claim this business (Free)
            </a>
          )}

          <a
            href={
              `mailto:help@outbackconnections.com.au` +
              `?subject=${encodeURIComponent(`Report incorrect details: ${title}`)}` +
              `&body=${encodeURIComponent(
                `Listing: ${title}\n\nWhat needs correcting (phone, town, service area, or specialties):\n`
              )}`
            }
            className="inline-flex items-center rounded-lg border border-amber-400 bg-white px-3.5 py-2 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-100"
          >
            ✎ Report incorrect details
          </a>

          <a
            href={
              `mailto:help@outbackconnections.com.au` +
              `?subject=${encodeURIComponent(`Remove my listing: ${title}`)}` +
              `&body=${encodeURIComponent(
                `Listing: ${title}\n\nPlease remove this listing from Outback Connections.\nMy name and role at the business:\nBest contact number:\n`
              )}`
            }
            className="inline-flex items-center rounded-lg border border-red-300 bg-white px-3.5 py-2 text-xs font-semibold text-red-900 shadow-sm hover:bg-red-50"
          >
            ✕ Remove my listing
          </a>
        </div>

        {businessId && (
          <div className="mt-2.5 text-xs text-amber-900">
            <ClaimButton
              businessId={businessId}
              signedIn={signedIn}
              signInRedirect={signInRedirect}
            />
          </div>
        )}

        <p className="mt-2 text-xs text-amber-800">
          Need something else fixed or have a concern?{" "}
          <a href={fixOrRemoveHref} className="underline">
            Email help@outbackconnections.com.au
          </a>{" "}
          or{" "}
          <Link href="/report" className="underline">
            use the report form
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
