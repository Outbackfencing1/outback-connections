// components/detail/ScrapedNotice.tsx — server component.
// Honest marker for scraped, unclaimed directory listings. Shown on detail
// pages in place of the contact block (scraped rows carry no confirmed contact;
// the path to the business is the original source). The "claim it" CTA is a
// mailto for now — the real claim flow is a separate build gate.
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

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <p className="font-semibold text-amber-900">Unclaimed listing</p>
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
  );
}
