import Link from "next/link";
import { supabaseServer } from "@/lib/supabase";
import { notFound } from "next/navigation";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props) {
  const supa = supabaseServer();
  if (!supa) return { title: "Opportunity – Outback Connections" };

  const { data } = await supa
    .from("jobs")
    .select("title")
    .eq("slug", params.slug)
    .single();

  return {
    title: data
      ? `${data.title} – Outback Connections`
      : `${params.slug.replace(/-/g, " ")} – Outback Connections`,
  };
}

export default async function OpportunityDetailPage({ params }: Props) {
  const { slug } = params;
  const supa = supabaseServer();

  if (!supa) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-neutral-500">Database not configured.</p>
      </main>
    );
  }

  const { data: job, error } = await supa
    .from("jobs")
    .select("id, title, description, location, rate, status, created_at")
    .eq("slug", slug)
    .single();

  if (error || !job) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/opportunities"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 transition"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to opportunities
      </Link>

      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <h1 className="text-2xl font-bold text-neutral-900">{job.title}</h1>
          {job.rate && (
            <span className="shrink-0 rounded-full bg-green-50 border border-green-200 px-3 py-1 text-sm font-semibold text-green-800">
              {job.rate}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm text-neutral-500">
          {job.location && (
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {job.location}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            Posted{" "}
            {new Date(job.created_at).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span className={`inline-flex items-center gap-1 font-medium ${job.status === "open" ? "text-green-600" : "text-neutral-400"}`}>
            <span className={`w-2 h-2 rounded-full ${job.status === "open" ? "bg-green-500" : "bg-neutral-300"}`} />
            {job.status === "open" ? "Open" : job.status}
          </span>
        </div>

        {job.description && (
          <div className="mt-6 prose prose-neutral prose-sm max-w-none">
            <h2 className="text-lg font-semibold text-neutral-900">Description</h2>
            <p className="mt-2 text-neutral-700 leading-relaxed whitespace-pre-line">
              {job.description}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-[#2D5016] px-6 py-3 text-center text-sm font-semibold text-white hover:bg-[#234012] transition shadow-sm"
          >
            Apply / Contact
          </Link>
          <Link
            href="/opportunities"
            className="rounded-lg border border-neutral-300 px-6 py-3 text-center text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition"
          >
            Browse More Opportunities
          </Link>
        </div>
      </div>
    </main>
  );
}
