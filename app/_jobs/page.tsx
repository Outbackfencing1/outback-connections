import type { Metadata } from "next";
import Link from "next/link";

type PageProps = {
  params: { id: string };
};

async function getJobById(id: string) {
  return {
    id,
    title: `Job ${id}`,
    location: "Orange, NSW",
    budget: "$2,500 est",
    details: "Example job details go here.",
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const job = await getJobById(params.id);
  return { title: `${job.title} • OutbackConnections` };
}

export default async function JobPage({ params }: PageProps) {
  const job = await getJobById(params.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-neutral-600 hover:underline">Home</Link>
        <span>›</span>
        <Link href="/contractor" className="text-neutral-600 hover:underline">
          OutbackConnections Dashboard
        </Link>
        <span>›</span>
        <span className="text-neutral-800 font-semibold">Job {job.id}</span>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-green-800">{job.title}</h1>
        <div className="mt-2 text-sm text-neutral-600">{job.location}</div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border bg-neutral-50 p-4">
            <div className="text-xs text-neutral-500">Budget</div>
            <div className="mt-1 text-base font-semibold">{job.budget}</div>
          </div>
          <div className="rounded-xl border bg-neutral-50 p-4 md:col-span-2">
            <div className="text-xs text-neutral-500">Status</div>
            <div className="mt-1 text-base font-semibold">Open for quotes</div>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="text-lg font-bold">Details</h2>
          <p className="mt-2 text-neutral-700">{job.details}</p>
        </div>

        <div className="mt-6 flex gap-2">
          <Link
            href="/contractor"
            className="rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-neutral-50"
          >
            Back
          </Link>
          <button className="rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">
            Send Quote
          </button>
        </div>
      </div>
    </div>
  );
}
