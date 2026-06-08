// components/detail/ScrapedNotice.tsx — server component.
// Honest marker for scraped, unclaimed directory listings. Shown on detail
// pages in place of the contact block (scraped rows carry no confirmed contact;
// the path to the business is the original source). The "claim it" CTA is a
// mailto for now — the real claim flow is a separate build gate.
import Link from "next/link";

function prettyPlatform(p: string | null): string | null {
  if (!p) return null;
  if (p === "google_maps") return "Google Maps";
  return p.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ScrapedNotice({
  title,
  sourcePlatform,
  sourceUrl,
}: {
  title: string;
  sourcePlatform: string | null;
  sourceUrl: string | null;
}) {
  const platform = prettyPlatform(sourcePlatform);
  const claimHref =
    `mailto:help@outbackconnections.com.au` +
    `?subject=${encodeURIComponent(`Claim listing: ${title}`)}` +
    `&body=${encodeURIComponent(
      `I'd like to claim this listing: ${title}.\n\nMy name:\nMy role at the business:\nBest contact number:\n`
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
            href={sourceUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="font-medium text-amber-900 underline"
          >
            View the original listing →
          </a>
        </p>
      )}
      <p className="mt-3 text-sm text-amber-900">
        Is this your business?{" "}
        <a href={claimHref} className="font-medium underline">
          Claim it
        </a>{" "}
        to confirm the details and post real job ads. (Claiming opens soon —
        email us and we&apos;ll set you up.)
      </p>
      <p className="mt-3 text-xs text-amber-800">
        Listed something that shouldn&apos;t be here?{" "}
        <Link href="/report" className="underline">
          Tell us
        </Link>
        .
      </p>
    </div>
  );
}
