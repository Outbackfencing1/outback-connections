// app/dashboard/opportunities/page.tsx
import Link from "next/link";
import { allJobs } from "@/lib/jobs";

export const metadata = {
  title: "Opportunities – OutbackConnections",
  description: "Browse available jobs posted by customers.",
};

export default function OpportunitiesPage() {
  const jobs = allJobs();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-bold">Opportunities</h1>
        <Link
          href="/post-a-job"
          className="rounded-full border px-4 py-2 text-sm hover:bg-gray-50"
        >
          Post a job
        </Link>
      </div>

      <p className="mt-2 text-gray-600">
        A simple list of live roles. Click into any card for full details.
      </p>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-5">
        {jobs.map((job) => (
          <article key={job.slug} className="rounded-2xl border p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold">{job.title}</h2>
              <span className="shrink-0 text-sm font-medium text-gray-600">
                {job.rate}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-600">{job.location}</p>
            <p className="mt-3 text-gray-700 text-sm">
              {job.description.slice(0, 120)}…
            </p>
            <div className="mt-4 flex items-center justify-between">
              <Link
                href={`/dashboard/opportunities/${job.slug}`}
                className="inline-flex rounded-full px-4 py-2 text-sm border font-medium hover:bg-gray-50 transition"
              >
                View details
              </Link>
              <time
                className="text-xs text-gray-500"
                dateTime={job.postedAt}
                suppressHydrationWarning
              >
                Posted {new Date(job.postedAt).toLocaleDateString()}
              </time>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}