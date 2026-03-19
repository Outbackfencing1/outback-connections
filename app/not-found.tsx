// app/not-found.tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16">
      <div className="rounded-2xl border bg-white p-10 shadow-sm text-center">
        <div className="inline-block rounded-full bg-green-50 border border-green-200 px-4 py-1.5 text-sm font-semibold text-green-800">
          404
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-neutral-900">
          Page not found
        </h1>
        <p className="mt-3 text-neutral-600 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-green-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-800 transition shadow-sm"
          >
            Go home
          </Link>
          <Link
            href="/opportunities"
            className="rounded-full border px-5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition"
          >
            Browse opportunities
          </Link>
        </div>
      </div>
    </main>
  );
}
