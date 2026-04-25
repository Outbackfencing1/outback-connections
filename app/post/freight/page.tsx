import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { checkPostingGuard } from "@/lib/posting";
import PostFreightForm from "@/components/posting/PostFreightForm";
import { postFreight } from "./actions";

export const metadata = {
  title: "Post freight — Outback Connections",
  description: "Post a freight need or available run. Free, direct contact.",
};

export const dynamic = "force-dynamic";

export default async function PostFreightPage() {
  const guard = await checkPostingGuard();
  if (!guard.ok && guard.reason === "not_signed_in") {
    redirect("/signin?next=/post/freight");
  }
  if (!guard.ok) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold tracking-tight">Post freight</h1>
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
    .eq("pillar", "freight")
    .eq("active", true)
    .order("sort_order");

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Post freight</h1>
      <p className="mt-2 text-sm text-neutral-700">
        Need something moved, or got a truck running empty? Post it. Free.
      </p>

      <div className="mt-8">
        <PostFreightForm categories={cats ?? []} action={postFreight} />
      </div>

      <p className="mt-10 text-xs text-neutral-500">
        <Link href="/post" className="underline">
          ← Back to post hub
        </Link>
      </p>
    </div>
  );
}
