// app/jobs/[id]/page.tsx
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Job = {
  id: string;
  title: string;
  description: string;
  location: string;
  budget: number | null;
  category: string | null;
  contactName: string | null;
  contactEmail: string | null;
  createdAt: string;
};

async function getJob(id: string): Promise<Job | null> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const res = await fetch(`${base}/api/jobs`, { cache: "no-store", next: { revalidate: 0 } });
  if (!res.ok) return null;
  const data = (await res.json()) as { jobs?: Job[] };
  return (data.jobs ?? []).find(j => j.id === id) ?? null;
}

export default async function JobDetail({
  params,
}: {
  params: { id: string };
}) {
  const job = await getJob(params.id);

  if (!job) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Link href="/jobs" className="text-green-700 underline">← Back to jobs</Link>
        <h1 className="text-2xl font-bold mt-4">Job not found</h1>
        <p className="opacity-80 mt-2">The job may have been removed or the link is incorrect.</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/jobs" className="text-green-700 underline">← Back to jobs</Link>
        <Link
          href="/post-a-job"
          className="px-3 py-2 rounded bg-green-600 text-white hover:opacity-90"
        >
          Post a Job
        </Link>
      </div>

      <h1 className="text-3xl font-bold">{job.title}</h1>

      <div className="text-sm opacity-70">
        Posted: {new Date(job.createdAt).toLocaleString()}
      </div>

      <div className="rounded border p-4 bg-white">
        <div className="opacity-90">
          <div><span className="font-medium">Location:</span> {job.location}</div>
          {job.budget != null && (
            <div><span className="font-medium">Budget:</span> ${job.budget}</div>
          )}
          {job.category && (
            <div><span className="font-medium">Category:</span> {job.category}</div>
          )}
        </div>

        <hr className="my-4" />

        <div className="whitespace-pre-wrap leading-relaxed">
          {job.description}
        </div>

        {(job.contactName || job.contactEmail) && (
          <>
            <hr className="my-4" />
            <div className="space-y-1">
              {job.contactName && (
                <div><span className="font-medium">Contact:</span> {job.contactName}</div>
              )}
              {job.contactEmail && (
                <div>
                  <span className="font-medium">Email:</span>{" "}
                  <a className="text-green-700 underline" href={`mailto:${job.contactEmail}`}>
                    {job.contactEmail}
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
