import { supabaseServer } from "@/lib/supabase";
import Link from "next/link";

export const metadata = { title: "Fencing Opportunities – Outback Connections" };

export default async function OpportunitiesListPage() {
  const supa = supabaseServer();
  let jobs: any[] = [];
  let error: string | null = null;

  if (supa) {
    const res = await supa
      .from("jobs")
      .select("id,title,location,rate,slug,created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);

    if (res.error) {
      error = res.error.message;
    } else {
      jobs = res.data ?? [];
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">Fencing Opportunities</h1>
      <p className="mt-1 text-neutral-600">
        Browse available fencing work across rural and regional Australia.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border bg-red-50 border-red-200 p-4">
          <p className="text-sm text-red-700">Failed to load jobs: {error}</p>
        </div>
      )}

      {!error && jobs.length > 0 && (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold text-neutral-900">{job.title}</h2>
              <div className="mt-2 flex items-center justify-between">
                {job.location && (
                  <span className="text-sm text-neutral-600">{job.location}</span>
                )}
                {job.rate && (
                  <span className="text-sm font-semibold text-neutral-800">{job.rate}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!error && jobs.length === 0 && (
        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h2 className="mt-4 text-lg font-semibold text-neutral-900">No jobs posted yet</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Be the first to post a fencing job and connect with contractors in your area.
          </p>
          <Link
            href="/post-a-job"
            className="mt-5 inline-block rounded-lg bg-[#2D5016] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#234012] transition shadow-sm"
          >
            Post a Job
          </Link>
        </div>
      )}
    </main>
  );
}
