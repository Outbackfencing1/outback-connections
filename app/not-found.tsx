// app/not-found.tsx
import Link from "next/link";
import { getCountsByPillar } from "@/lib/category-counts";

const btn =
  "inline-flex items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50";

export default async function NotFound() {
  // Same rule as the header nav: an empty section isn't offered.
  const counts = await getCountsByPillar();
  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-medium text-green-800">404</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          That page isn&apos;t here.
        </h1>
        <p className="mt-3 max-w-prose text-sm text-neutral-700">
          Could&apos;ve been a typo, an old link, or a listing that&apos;s
          since expired. Try one of these.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-800"
          >
            Go home
          </Link>
          <Link
            href="/services"
            className="inline-flex items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Services
          </Link>
          {counts.jobs.total > 0 && (
            <Link href="/jobs" className={btn}>
              Jobs
            </Link>
          )}
          {counts.freight.total > 0 && (
            <Link href="/freight" className={btn}>
              Freight
            </Link>
          )}
          {counts.sale.total > 0 && (
            <Link href="/sale" className={btn}>
              For sale
            </Link>
          )}
          <Link
            href="/post"
            className="inline-flex items-center justify-center rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50"
          >
            Post a listing
          </Link>
        </div>
      </div>
    </main>
  );
}
