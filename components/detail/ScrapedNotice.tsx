// components/detail/ScrapedNotice.tsx — server component.
// Shows 1-click public contact buttons (Call, SMS, Email, Website) alongside
// the honest disclosure for unclaimed directory listings.
import Link from "next/link";
import ClaimButton from "./ClaimButton";
import { prettyPlatform } from "@/lib/source-platforms";
import { formatPhoneHref, isAustralianMobile } from "@/lib/trust";

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
  // No form and no legal complaint needed: a person reads help@ and makes
  // the change.
  const fixOrRemoveHref =
    `mailto:help@outbackconnections.com.au` +
    `?subject=${encodeURIComponent(`Fix or remove listing: ${title}`)}` +
    `&body=${encodeURIComponent(
      `Listing: ${title}\n\nPlease (fix / remove) it.\nWhat should change:\nMy name and role at the business:\n`
    )}`;

  const phoneHref = formatPhoneHref(contactPhone);
  const canSms = isAustralianMobile(contactPhone);
  const hasDirectContact = !!(phoneHref || contactEmail || websiteUrl);

  return (
    <div className="space-y-4">
      {hasDirectContact && (
        <div className="rounded-2xl border border-green-300 bg-green-50/60 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-green-800">
            Direct Business Contact — 1-Click
          </p>
          <p className="mt-0.5 text-base font-bold text-neutral-900">
            Reach {title} directly
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            {phoneHref && (
              <a
                href={`tel:${phoneHref}`}
                className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-green-800"
              >
                📞 Call {contactPhone}
              </a>
            )}
            {phoneHref && canSms && (
              <a
                href={`sms:${phoneHref}?body=${encodeURIComponent(
                  `Hi ${title}, found your business on Outback Connections — are you available for a quote?`
                )}`}
                className="inline-flex items-center gap-2 rounded-xl border border-green-700 bg-white px-4 py-2.5 text-sm font-bold text-green-900 shadow-sm hover:bg-green-100"
              >
                💬 Send SMS
              </a>
            )}
            {contactEmail && (
              <a
                href={`mailto:${contactEmail}?subject=${encodeURIComponent(
                  `Enquiry via Outback Connections: ${title}`
                )}`}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700 hover:text-green-900"
              >
                ✉️ {contactEmail}
              </a>
            )}
            {websiteUrl && (
              <a
                href={websiteUrl}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm hover:border-green-700 hover:text-green-900"
              >
                🌐 Visit Website →
              </a>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
        <span className="inline-block rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-semibold text-amber-900">
          Unclaimed Profile — Is this your business? Claim for free
        </span>
        <p className="mt-2 text-sm text-amber-900">
          This wasn&apos;t posted by the business. We found <strong>{title}</strong>
          {platform ? <> listed on {platform}</> : null} and added it to the
          directory so people can find it — the details haven&apos;t been confirmed
          by the owner.
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
        <p className="mt-3 text-sm text-amber-900">
          Is this your business?{" "}
          {businessId ? (
            <ClaimButton
              businessId={businessId}
              signedIn={signedIn}
              signInRedirect={signInRedirect}
            />
          ) : (
            <a href={claimHref} className="font-medium underline">
              Claim it
            </a>
          )}{" "}
          to confirm the details and manage the listing.
        </p>
        <p className="mt-3 text-xs text-amber-800">
          Want this entry changed or taken down?{" "}
          <a href={fixOrRemoveHref} className="underline">
            Email us
          </a>{" "}
          and we&apos;ll fix or remove it. Something else wrong?{" "}
          <Link href="/report" className="underline">
            Report it
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

