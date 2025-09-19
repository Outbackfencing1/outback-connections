// app/opportunities/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Opportunities – OutbackConnections"
};

export default function OpportunitiesPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-bold tracking-tight">Opportunities</h1>
      <p className="mt-2 text-neutral-600">
        Browse available jobs and apply. (This is a placeholder page.)
      </p>

      <div className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-neutral-700">
          No jobs yet.{" "}
          <Link href="/post-a-job" className="underline">
            Post a job
          </Link>{" "}
          to get quotes.
        </p>
      </div>
    </div>
  );
}
