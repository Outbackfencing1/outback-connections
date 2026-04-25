import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { checkPostingGuard } from "@/lib/posting";
import PostServiceForm from "@/components/posting/PostServiceForm";
import { postServiceRequest } from "./actions";

export const metadata = {
  title: "Request a service — Outback Connections",
  description:
    "Need a rural specialist for a one-off job? Post what you need and let providers reach out. Free.",
};

export const dynamic = "force-dynamic";

export default async function PostServiceRequestPage() {
  const guard = await checkPostingGuard();
  if (!guard.ok && guard.reason === "not_signed_in") {
    redirect("/signin?next=/post/service/request");
  }
  if (!guard.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Request a service</h1>
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
    .eq("pillar", "services")
    .eq("active", true)
    .order("sort_order");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Request a service</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Need a bore pump fixed, a mob mustered, a drone spray? Describe the
        job and let providers come to you.
      </p>

      <div className="mt-8">
        <PostServiceForm
          categories={cats ?? []}
          action={postServiceRequest}
          mode="requesting"
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
