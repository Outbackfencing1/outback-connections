// components/browse/Pagination.tsx — server component, simple page-based.
// Renders prev / page-of-total / next as <Link>. Zero client JS.
import Link from "next/link";

type Props = {
  /** Current page (1-based) */
  page: number;
  /** Total result count from the COUNT query */
  total: number;
  /** Items per page (default 20) */
  pageSize?: number;
  /** Base href without page param. Other query params should be included. */
  baseHref: string;
};

export default function Pagination({
  page,
  total,
  pageSize = 20,
  baseHref,
}: Props) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  if (lastPage <= 1) return null;

  function pageLink(p: number): string {
    const sep = baseHref.includes("?") ? "&" : "?";
    return p === 1 ? baseHref : `${baseHref}${sep}page=${p}`;
  }

  return (
    <nav
      aria-label="Pagination"
      className="mt-6 flex items-center justify-between border-t border-neutral-200 pt-4 text-sm"
    >
      <div>
        {page > 1 ? (
          <Link
            href={pageLink(page - 1)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
          >
            ← Previous
          </Link>
        ) : (
          <span className="rounded-md border border-neutral-200 px-3 py-1.5 text-neutral-400">
            ← Previous
          </span>
        )}
      </div>

      <p className="text-neutral-700">
        Page {page} of {lastPage} · {total} listing{total === 1 ? "" : "s"}
      </p>

      <div>
        {page < lastPage ? (
          <Link
            href={pageLink(page + 1)}
            className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
          >
            Next →
          </Link>
        ) : (
          <span className="rounded-md border border-neutral-200 px-3 py-1.5 text-neutral-400">
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
