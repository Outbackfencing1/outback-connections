// components/detail/SyndicatedNotice.tsx — server component.
// Honest marker for SYNDICATED job ads (source_platform='adzuna'). Distinct
// from ScrapedNotice: a syndicated ad is a real vacancy that lives on another
// board — the apply path is the original ad (link-out via the source redirect
// so apply intent is tracked), there is no claim CTA, and no contact block.
import Link from "next/link";

export default function SyndicatedNotice({
  company,
  locationDisplay,
  sourceUrl,
  listingId,
}: {
  company: string | null;
  locationDisplay: string | null;
  sourceUrl: string | null;
  listingId: string;
}) {
  return (
    <div className="rounded-xl border border-sky-300 bg-sky-50 p-5">
      <p className="font-semibold text-sky-900">Syndicated job ad</p>
      <p className="mt-2 text-sm text-sky-900">
        This vacancy{company ? <> from <strong>{company}</strong></> : null}
        {locationDisplay ? <> ({locationDisplay})</> : null} is syndicated from
        Adzuna — it wasn&apos;t posted on Outback Connections directly, and
        applications happen on the original ad.
      </p>
      {sourceUrl && (
        <p className="mt-3 text-sm">
          <a
            href={`/listings/${listingId}/source`}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="inline-block rounded-lg bg-sky-700 px-3 py-1.5 font-semibold text-white shadow-sm hover:bg-sky-800"
          >
            Apply on the original ad →
          </a>
        </p>
      )}
      <p className="mt-3 text-xs text-sky-800">
        Jobs by <a href="https://www.adzuna.com.au" target="_blank" rel="nofollow noopener noreferrer" className="underline">Adzuna</a>.
        Something wrong with this ad?{" "}
        <Link href="/report" className="underline">
          Tell us
        </Link>
        .
      </p>
    </div>
  );
}
