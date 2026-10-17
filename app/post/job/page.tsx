import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { checkPostingGuard } from "@/lib/posting";
import StaffPostNotice from "@/components/posting/StaffPostNotice";
import PostJobForm from "@/components/posting/PostJobForm";
import { postJob } from "./actions";

export const metadata = {
  title: "Post a job or list your skills — Outback Connections",
  description:
    "Post a rural job or list your skills, licences and availability as a driver, machine operator, fencer or station hand. Free, no lead fees, direct contact.",
};

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function PostJobPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const sp = (await searchParams) ?? {};
  const rawDir = Array.isArray(sp.direction) ? sp.direction[0] : sp.direction;
  const direction = rawDir === "available_for_work" ? "available_for_work" : "hiring";
  const isWorker = direction === "available_for_work";

  const guard = await checkPostingGuard();
  if (!guard.ok && guard.reason === "not_signed_in") {
    const nextPath = isWorker ? "/post/job?direction=available_for_work" : "/post/job";
    redirect(`/signin?next=${encodeURIComponent(nextPath)}`);
  }
  if (!guard.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">
          {isWorker ? "List your skills & availability" : "Post a job"}
        </h1>
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Can&apos;t post yet</p>
          <p className="mt-2">{guard.message}</p>
        </div>
        <p className="mt-8 text-sm">
          <Link href="/post" className="underline">
            ← Back to post hub
          </Link>
        </p>
      </div>
    );
  }

  const supa = createClient();
  const { data: cats } = await supa
    .from("categories")
    .select("id, slug, label")
    .eq("pillar", "jobs")
    .eq("active", true)
    .order("sort_order");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">
        {isWorker ? "List your skills & availability" : "Post a job or list your skills"}
      </h1>
      <StaffPostNotice kind="job" />
      <p className="mt-2 text-sm text-neutral-700">
        {isWorker
          ? "Put your tickets, machinery experience, rate, and availability on the board so farmers and contractors can find you directly. 100% free."
          : "Free to post a job or list yourself as available for work. Direct contact, no lead fees, ever."}
      </p>

      <div className="mt-8">
        <PostJobForm
          categories={cats ?? []}
          action={postJob}
          defaults={{ direction }}
        />
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/post" className="underline">
          ← Back to post hub
        </Link>
      </p>
    </div>
  );
}
