// app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <div className="rounded-2xl border bg-white p-10 shadow-sm">
        <p className="text-sm font-medium text-emerald-700">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          This page could not be found
        </h1>
        <p className="mt-3 max-w-prose text-neutral-600">
          The page may have moved, or the link you followed might be broken.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-2 text-white transition hover:bg-emerald-800"
          >
            Go home
          </Link>
          <Link
            href="/opportunities"
            className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-neutral-800 hover:bg-neutral-50"
          >
            Browse opportunities
          </Link>
          <Link
            href="/post-a-job"
            className="inline-flex items-center justify-center rounded-xl border px-4 py-2 text-neutral-800 hover:bg-neutral-50"
          >
            Post a job
          </Link>
        </div>
      </div>
    </main>
  );
}
