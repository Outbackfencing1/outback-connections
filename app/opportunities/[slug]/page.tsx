// app/dashboard/opportunities/[slug]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPrisma } from "@/lib/prisma";
import { allJobs, getJobBySlug } from "@/lib/jobs";

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const prisma = getPrisma();
  let title = "Opportunity";
  let description = "Job opportunity";

  if (prisma) {
    const job = await prisma.job.findUnique({ where: { slug: params.slug } });
    if (job) {
      title = `${job.title} – OutbackConnections`;
      description = `${job.location}${job.rate ? " • " + job.rate : ""} — ${job.description.slice(0, 120)}…`;
    }
  } else {
    const job = getJobBySlug(params.slug);
    if (job) {
      title = `${job.title} – OutbackConnections`;
      description = `${job.location} • ${job.rate} — ${job.description.slice(0, 120)}…`;
    }
  }

  return { title, description };
}

export default async function OpportunityDetailPage({ params }: { params: Params }) {
  const prisma = getPrisma();
  let job:
    | { title: string; location: string; rate: string | null; description: string; postedAt: Date }
    | null = null;

  if (prisma) {
    job = await prisma.job.findUnique({
      where: { slug: params.slug },
      select: { title: true, location: true, rate: true, description: true, postedAt: true },
    });
  } else {
    const fallback = getJobBySlug(params.slug);
    if (fallback) {
      job = {
        title: fallback.title,
        location: fallback.location,
        rate: fallback.rate,
        description: fallback.description,
        postedAt: new Date(fallback.postedAt),
      };
    }
  }

  if (!job) notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/dashboard/opportunities" className="text-sm underline">
        &larr; Back to opportunities
      </Link>

      <h1 className="mt-4 text-3xl font-bold">{job.title}</h1>
      <p className="mt-1 text-gray-600">{job.location}</p>

      <div className="mt-6 rounded-2xl border p-6 shadow-sm">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Rate
            </dt>
            <dd className="text-base font-medium">{job.rate || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              Posted
            </dt>
            <dd className="text-base font-medium" suppressHydrationWarning>
              {job.postedAt.toLocaleDateString()}
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-gray-800 leading-7">{job.description}</p>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/login?callbackUrl=/dashboard/opportunities"
            className="rounded-full bg-green-700 px-5 py-3 text-center text-white font-medium hover:bg-green-800 transition"
          >
            Sign in to apply
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border px-5 py-3 text-center font-medium hover:bg-gray-50 transition"
          >
            See pricing
          </Link>
        </div>
      </div>
    </main>
  );
}
